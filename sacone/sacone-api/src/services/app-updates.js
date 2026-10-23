import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../core/http.js';
import { API_ROOT } from '../cloud/snapshot.js';
import { authService } from './index.js';

/**
 * SAC-POS app updates. GitHub Actions builds the APK on EAS and publishes a release tagged
 * `sac-pos-v<version>` with two assets: `sac-pos.apk` and `sac-pos.json`
 * ({ versionName, versionCode, sha256, size, notes, commit, publishedAt }).
 *
 * This server copies the newest release into data/app-releases/ (checked at start and every
 * 30 minutes, or on demand from ERP → POS Devices), verifies its SHA-256, and serves it to
 * paired phones over the shop network, so phones need no internet of their own to update.
 */

const REPO = process.env.SAC_POS_RELEASE_REPO || 'playersaksham117/SAC-ONE';
const DIR = path.join(API_ROOT, 'data', 'app-releases');
const LATEST = path.join(DIR, 'latest.json');
const CHECK_EVERY_MS = 30 * 60 * 1000;
const KEEP = 2;

const state = { checking: null, lastCheckAt: null, lastError: null };

function readLatest() {
  try {
    const meta = JSON.parse(fs.readFileSync(LATEST, 'utf8'));
    return fs.existsSync(path.join(DIR, meta.file)) ? meta : null;
  } catch {
    return null;
  }
}

async function getJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'sacone-api' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url}`);
  return res.json();
}

/** Newest published release of the app (tag sac-pos-v*) with both assets. */
async function newestRelease() {
  const releases = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=20`);
  for (const r of releases) {
    if (r.draft || !String(r.tag_name).startsWith('sac-pos-v')) continue;
    const apk = r.assets.find((a) => a.name === 'sac-pos.apk');
    const meta = r.assets.find((a) => a.name === 'sac-pos.json');
    if (apk && meta) return { release: r, apk, meta };
  }
  return null;
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': 'sacone-api' }, redirect: 'follow', signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

async function check() {
  state.lastCheckAt = new Date().toISOString();
  try {
    const found = await newestRelease();
    if (!found) { state.lastError = null; return readLatest(); }
    const meta = await (await fetch(found.meta.browser_download_url, { redirect: 'follow', signal: AbortSignal.timeout(30000) })).json();
    const versionCode = Number(meta.versionCode);
    if (!Number.isInteger(versionCode) || versionCode < 1 || !/^[0-9a-f]{64}$/i.test(String(meta.sha256))) {
      throw new Error(`Release ${found.release.tag_name}: sac-pos.json is incomplete`);
    }
    const current = readLatest();
    if (current && current.versionCode >= versionCode) { state.lastError = null; return current; }

    fs.mkdirSync(DIR, { recursive: true });
    const name = `sac-pos-${versionCode}.apk`;
    const partial = path.join(DIR, `${name}.part`);
    await download(found.apk.browser_download_url, partial);
    const digest = await sha256(partial);
    if (digest.toLowerCase() !== String(meta.sha256).toLowerCase()) {
      fs.rmSync(partial, { force: true });
      throw new Error(`Release ${found.release.tag_name}: APK checksum does not match`);
    }
    fs.renameSync(partial, path.join(DIR, name));
    const latest = {
      versionName: String(meta.versionName || ''),
      versionCode,
      sha256: digest,
      size: fs.statSync(path.join(DIR, name)).size,
      notes: String(meta.notes || '').slice(0, 2000),
      commit: meta.commit || null,
      publishedAt: meta.publishedAt || found.release.published_at,
      tag: found.release.tag_name,
      file: name,
      fetchedAt: new Date().toISOString(),
    };
    fs.writeFileSync(LATEST, JSON.stringify(latest, null, 2));
    // keep the newest few APKs only
    const apks = fs.readdirSync(DIR).filter((f) => /^sac-pos-\d+\.apk$/.test(f))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
    for (const old of apks.slice(KEEP)) fs.rmSync(path.join(DIR, old), { force: true });
    state.lastError = null;
    return latest;
  } catch (e) {
    state.lastError = e.message;
    return readLatest();
  }
}

function publicMeta(m) {
  return m ? {
    versionName: m.versionName, versionCode: m.versionCode, size: m.size, sha256: m.sha256,
    notes: m.notes, publishedAt: m.publishedAt, tag: m.tag,
  } : null;
}

export const appUpdateService = {
  /** Check now unless a check is already running (shared promise). */
  refresh() {
    state.checking ??= check().finally(() => { state.checking = null; });
    return state.checking;
  },

  start() {
    if (process.env.SAC_POS_UPDATES === 'off') return;
    setTimeout(() => this.refresh().catch(() => undefined), 10_000).unref();
    setInterval(() => this.refresh().catch(() => undefined), CHECK_EVERY_MS).unref();
  },

  /** For phones (device key): the newest app this server holds. */
  latest() {
    return { latest: publicMeta(readLatest()) };
  },

  /** Absolute path of a held APK, for streaming to a phone. */
  apkFile(versionCode) {
    const m = readLatest();
    if (!m || (versionCode && Number(versionCode) !== m.versionCode)) throw new AppError('That app version is not available on this server', 404, 'APP_NOT_FOUND');
    return { file: path.join(DIR, m.file), name: `SAC-POS-${m.versionName || m.versionCode}.apk`, size: m.size };
  },

  /** ERP → POS Devices: what phones will be offered, and the last check. */
  status(actor) {
    authService.checkPermission(actor.permissions, 'pos.devices.view');
    return { repo: REPO, latest: publicMeta(readLatest()), lastCheckAt: state.lastCheckAt, lastError: state.lastError, checking: Boolean(state.checking) };
  },

  async checkNow(actor) {
    authService.checkPermission(actor.permissions, 'pos.devices.edit');
    await this.refresh();
    return this.status(actor);
  },
};
