import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { isDate, istDate } from '../core/ist.js';
import { currentFirmId } from '../database/context.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { customerService } from './parties.js';

/**
 * CRM: leads with a stage and an owner, follow-ups due on a date, and an activity log for leads
 * and customers. Staff see the leads and follow-ups assigned to them (or that they created);
 * crm.leads.approve sees and reassigns everyone's.
 */

export const STAGES = ['new', 'contacted', 'quoted', 'won', 'lost'];
const KINDS = ['call', 'visit', 'whatsapp', 'email', 'meeting'];
const ACTIVITY_KINDS = [...KINDS, 'note'];

const can = (actor, key) => actor.permissions.includes(key);
const need = (actor, key) => authService.checkPermission(actor.permissions, key);
const seesAll = (actor) => can(actor, 'crm.leads.approve');
const text = (v, max = 500) => (String(v ?? '').trim().slice(0, max) || null);
const db = () => getDatabase();

function mapLead(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    city: r.city,
    source: r.source,
    requirement: r.requirement,
    expectedValue: Number(r.expected_value || 0),
    stage: r.stage,
    lostReason: r.lost_reason,
    assignedTo: r.assigned_to,
    assignedName: r.assigned_name || null,
    customerId: r.customer_id,
    createdBy: r.created_by,
    createdByName: r.created_by_name || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
    nextFollowUp: r.next_follow_up || null,
    lastActivityAt: r.last_activity_at || null,
  };
}

function mapFollowUp(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    customerId: r.customer_id,
    dueDate: r.due_date,
    kind: r.kind,
    purpose: r.purpose,
    assignedTo: r.assigned_to,
    assignedName: r.assigned_name || null,
    status: r.status,
    doneAt: r.done_at,
    createdAt: r.created_at,
    partyName: r.party_name || null,
    partyPhone: r.party_phone || null,
    partyCompany: r.party_company || null,
    leadStage: r.lead_stage || null,
  };
}

function mapActivity(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    customerId: r.customer_id,
    kind: r.kind,
    notes: r.notes,
    userId: r.user_id,
    userName: r.user_name,
    createdAt: r.created_at,
  };
}

const LEAD_SELECT = `
  SELECT l.*, ua.full_name AS assigned_name, uc.full_name AS created_by_name,
    (SELECT MIN(f.due_date) FROM crm_followups f WHERE f.lead_id = l.id AND f.status = 'open') AS next_follow_up,
    (SELECT MAX(a.created_at) FROM crm_activities a WHERE a.lead_id = l.id) AS last_activity_at
  FROM crm_leads l
  LEFT JOIN users ua ON ua.id = l.assigned_to
  LEFT JOIN users uc ON uc.id = l.created_by
`;

const FOLLOWUP_SELECT = `
  SELECT f.*, ua.full_name AS assigned_name,
    COALESCE(l.name, c.name) AS party_name,
    COALESCE(l.phone, c.phone) AS party_phone,
    l.company AS party_company,
    l.stage AS lead_stage
  FROM crm_followups f
  LEFT JOIN crm_leads l ON l.id = f.lead_id
  LEFT JOIN customers c ON c.id = f.customer_id
  LEFT JOIN users ua ON ua.id = f.assigned_to
`;

export class CrmService {
  /** Users of the open firm, for "assigned to" pickers. */
  users(actor) {
    need(actor, 'crm.leads.view');
    const firmId = currentFirmId();
    const list = repos.users.findAll({ firmId })
      .filter((u) => u.isActive)
      .map((u) => ({ id: u.id, fullName: u.fullName, roleName: u.roleName }));
    // The group owner works in every firm without being one of its users.
    if (!list.some((u) => u.id === actor.user.id)) list.unshift({ id: actor.user.id, fullName: actor.user.fullName, roleName: actor.user.roleName });
    return list;
  }

  #assignee(id, actor) {
    if (!id) return actor.user.id;
    if (id === actor.user.id) return id;
    if (!seesAll(actor)) throw new AppError('Only a manager can assign leads to someone else', 403);
    const user = repos.users.findById(id);
    if (!user || !user.isActive || (user.firmId && user.firmId !== currentFirmId())) throw new AppError('Choose a user of this firm', 400);
    return id;
  }

  #lead(id, actor) {
    const lead = mapLead(db().prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(id));
    if (!lead) throw new AppError('Lead not found', 404);
    if (!seesAll(actor) && lead.assignedTo !== actor.user.id && lead.createdBy !== actor.user.id) throw new AppError('Lead not found', 404);
    return lead;
  }

  #log({ leadId = null, customerId = null, kind, notes }, actor) {
    db().prepare(`
      INSERT INTO crm_activities (id, lead_id, customer_id, kind, notes, user_id, user_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), leadId, customerId, kind, notes, actor.user.id, actor.user.fullName, nowIso());
  }

  listLeads(query, actor) {
    need(actor, 'crm.leads.view');
    const where = [];
    const params = [];
    if (!seesAll(actor)) {
      where.push('(l.assigned_to = ? OR l.created_by = ?)');
      params.push(actor.user.id, actor.user.id);
    } else if (query.assigned === 'me') {
      where.push('l.assigned_to = ?');
      params.push(actor.user.id);
    } else if (query.assigned && query.assigned !== 'all') {
      where.push('l.assigned_to = ?');
      params.push(query.assigned);
    }
    const scoped = [...where];
    const scopedParams = [...params];
    if (query.stage === 'open') where.push("l.stage NOT IN ('won', 'lost')");
    else if (STAGES.includes(query.stage)) { where.push('l.stage = ?'); params.push(query.stage); }
    const q = String(query.q || '').trim();
    if (q) {
      where.push('(l.name LIKE ? OR l.company LIKE ? OR l.phone LIKE ? OR l.city LIKE ? OR l.requirement LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    const sql = `${LEAD_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE l.stage WHEN 'won' THEN 1 WHEN 'lost' THEN 2 ELSE 0 END,
        CASE WHEN next_follow_up IS NULL THEN 1 ELSE 0 END, next_follow_up, l.updated_at DESC
      LIMIT 500`;
    const items = db().prepare(sql).all(...params).map(mapLead);
    const counts = Object.fromEntries(STAGES.map((s) => [s, { count: 0, value: 0 }]));
    for (const r of db().prepare(`SELECT l.stage, COUNT(*) AS c, SUM(l.expected_value) AS v FROM crm_leads l
      ${scoped.length ? `WHERE ${scoped.join(' AND ')}` : ''} GROUP BY l.stage`).all(...scopedParams)) {
      counts[r.stage] = { count: r.c, value: Number(r.v || 0) };
    }
    return { items, counts };
  }

  getLead(id, actor) {
    need(actor, 'crm.leads.view');
    const lead = this.#lead(id, actor);
    return {
      ...lead,
      activities: db().prepare('SELECT * FROM crm_activities WHERE lead_id = ? ORDER BY created_at DESC').all(id).map(mapActivity),
      followUps: db().prepare(`${FOLLOWUP_SELECT} WHERE f.lead_id = ? ORDER BY f.status = 'open' DESC, f.due_date`).all(id).map(mapFollowUp),
    };
  }

  createLead(data, actor) {
    need(actor, 'crm.leads.create');
    const name = text(data.name, 120);
    if (!name) throw new AppError('Name is required', 400);
    if (data.followUpDate && !isDate(data.followUpDate)) throw new AppError('Follow-up date is not valid', 400);
    const id = generateId();
    const now = nowIso();
    const assignedTo = this.#assignee(data.assignedTo, actor);
    db().prepare(`
      INSERT INTO crm_leads (id, name, company, phone, email, city, source, requirement, expected_value, stage,
        assigned_to, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
    `).run(id, name, text(data.company, 120), text(data.phone, 20), text(data.email, 120), text(data.city, 80),
      text(data.source, 60), text(data.requirement, 1000), Math.max(0, Number(data.expectedValue) || 0),
      assignedTo, actor.user.id, now, now);
    if (data.followUpDate) {
      this.#insertFollowUp({ leadId: id, dueDate: data.followUpDate, kind: data.followUpKind, purpose: data.followUpPurpose || 'First call', assignedTo }, actor);
    }
    return this.getLead(id, actor);
  }

  updateLead(id, data, actor) {
    need(actor, 'crm.leads.edit');
    const lead = this.#lead(id, actor);
    const fields = {};
    for (const [key, col, max] of [['name', 'name', 120], ['company', 'company', 120], ['phone', 'phone', 20], ['email', 'email', 120],
      ['city', 'city', 80], ['source', 'source', 60], ['requirement', 'requirement', 1000]]) {
      if (data[key] !== undefined) fields[col] = text(data[key], max);
    }
    if (fields.name === null) throw new AppError('Name is required', 400);
    if (data.expectedValue !== undefined) fields.expected_value = Math.max(0, Number(data.expectedValue) || 0);
    if (data.assignedTo !== undefined && data.assignedTo !== lead.assignedTo) {
      fields.assigned_to = this.#assignee(data.assignedTo, actor);
      // Open follow-ups move with the lead.
      db().prepare("UPDATE crm_followups SET assigned_to = ? WHERE lead_id = ? AND status = 'open'").run(fields.assigned_to, id);
    }
    if (data.stage !== undefined && data.stage !== lead.stage) {
      if (!STAGES.includes(data.stage)) throw new AppError('Unknown stage', 400);
      if (data.stage === 'lost' && !text(data.lostReason)) throw new AppError('Say why the lead was lost', 400);
      fields.stage = data.stage;
      fields.lost_reason = data.stage === 'lost' ? text(data.lostReason, 300) : null;
      fields.closed_at = ['won', 'lost'].includes(data.stage) ? nowIso() : null;
      const label = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };
      this.#log({ leadId: id, kind: 'stage', notes: `Stage: ${label[lead.stage]} → ${label[data.stage]}${data.stage === 'lost' ? ` (${fields.lost_reason})` : ''}` }, actor);
      // Closing a lead closes its open follow-ups.
      if (['won', 'lost'].includes(data.stage)) db().prepare("UPDATE crm_followups SET status = 'cancelled' WHERE lead_id = ? AND status = 'open'").run(id);
    }
    const cols = Object.keys(fields);
    if (cols.length) {
      db().prepare(`UPDATE crm_leads SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...cols.map((c) => fields[c]), nowIso(), id);
    }
    return this.getLead(id, actor);
  }

  deleteLead(id, actor) {
    need(actor, 'crm.leads.delete');
    this.#lead(id, actor);
    db().prepare('DELETE FROM crm_leads WHERE id = ?').run(id);
    return { deleted: true };
  }

  /** A won lead becomes a customer (or links to the existing customer with the same mobile). */
  convertLead(id, actor, req) {
    need(actor, 'crm.leads.edit');
    const lead = this.#lead(id, actor);
    if (lead.customerId) throw new AppError('This lead is already a customer', 409);
    const existingId = lead.phone ? repos.customers.findImportMatch({ phone: lead.phone }) : null;
    const customer = existingId
      ? repos.customers.findById(existingId)
      : customerService.create({
        name: lead.company || lead.name, phone: lead.phone, email: lead.email, city: lead.city,
        notes: [lead.company ? `Contact: ${lead.name}` : '', lead.requirement].filter(Boolean).join(' · ') || null, sourceChannel: 'manual',
      }, actor, req);
    db().prepare('UPDATE crm_leads SET customer_id = ?, updated_at = ? WHERE id = ?').run(customer.id, nowIso(), id);
    if (lead.stage !== 'won') this.updateLead(id, { stage: 'won' }, actor);
    this.#log({ leadId: id, customerId: customer.id, kind: 'note', notes: existingId ? `Linked to existing customer ${customer.name}` : `Converted to customer ${customer.name}` }, actor);
    return { lead: this.getLead(id, actor), customer };
  }

  addActivity(data, actor) {
    const kind = ACTIVITY_KINDS.includes(data.kind) ? data.kind : 'note';
    const notes = text(data.notes, 2000);
    if (!notes) throw new AppError('Write what happened', 400);
    if (data.leadId) {
      need(actor, 'crm.leads.edit');
      const lead = this.#lead(data.leadId, actor);
      this.#log({ leadId: lead.id, kind, notes }, actor);
      if (lead.stage === 'new' && kind !== 'note') this.updateLead(lead.id, { stage: 'contacted' }, actor);
      db().prepare('UPDATE crm_leads SET updated_at = ? WHERE id = ?').run(nowIso(), lead.id);
      return this.getLead(lead.id, actor);
    }
    need(actor, 'crm.activities.create');
    this.#customer(data.customerId);
    this.#log({ customerId: data.customerId, kind, notes }, actor);
    return this.customerTimeline(data.customerId, actor);
  }

  #customer(id) {
    const customer = id ? repos.customers.findById(id) : null;
    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
  }

  #insertFollowUp({ leadId = null, customerId = null, dueDate, kind, purpose, assignedTo }, actor) {
    if (!isDate(dueDate)) throw new AppError('Choose the follow-up date', 400);
    const id = generateId();
    db().prepare(`
      INSERT INTO crm_followups (id, lead_id, customer_id, due_date, kind, purpose, assigned_to, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, leadId, customerId, dueDate, KINDS.includes(kind) ? kind : 'call', text(purpose, 300), assignedTo, actor.user.id, nowIso());
    return id;
  }

  addFollowUp(data, actor) {
    if (data.leadId) {
      need(actor, 'crm.leads.edit');
      const lead = this.#lead(data.leadId, actor);
      if (['won', 'lost'].includes(lead.stage)) throw new AppError('This lead is closed', 400);
      this.#insertFollowUp({ leadId: lead.id, dueDate: data.dueDate, kind: data.kind, purpose: data.purpose, assignedTo: this.#assignee(data.assignedTo || lead.assignedTo, actor) }, actor);
      return this.getLead(lead.id, actor);
    }
    need(actor, 'crm.activities.create');
    this.#customer(data.customerId);
    this.#insertFollowUp({ customerId: data.customerId, dueDate: data.dueDate, kind: data.kind, purpose: data.purpose, assignedTo: this.#assignee(data.assignedTo, actor) }, actor);
    return this.customerTimeline(data.customerId, actor);
  }

  #followUp(id, actor) {
    const row = db().prepare(`${FOLLOWUP_SELECT} WHERE f.id = ?`).get(id);
    if (!row) throw new AppError('Follow-up not found', 404);
    const f = mapFollowUp(row);
    if (!seesAll(actor) && f.assignedTo !== actor.user.id && row.created_by !== actor.user.id) throw new AppError('Follow-up not found', 404);
    if (f.status !== 'open') throw new AppError('This follow-up is already closed', 409);
    return f;
  }

  /** Done: log what happened and, optionally, book the next follow-up. */
  completeFollowUp(id, data, actor) {
    const f = this.#followUp(id, actor);
    need(actor, f.leadId ? 'crm.leads.edit' : 'crm.activities.create');
    const notes = text(data.notes, 2000);
    if (!notes) throw new AppError('Write what happened', 400);
    if (data.nextDate && !isDate(data.nextDate)) throw new AppError('Next follow-up date is not valid', 400);
    db().prepare("UPDATE crm_followups SET status = 'done', done_at = ? WHERE id = ?").run(nowIso(), id);
    this.#log({ leadId: f.leadId, customerId: f.customerId, kind: f.kind, notes }, actor);
    if (f.leadId) {
      if (f.leadStage === 'new') this.updateLead(f.leadId, { stage: 'contacted' }, actor);
      db().prepare('UPDATE crm_leads SET updated_at = ? WHERE id = ?').run(nowIso(), f.leadId);
    }
    if (data.nextDate) {
      this.#insertFollowUp({ leadId: f.leadId, customerId: f.customerId, dueDate: data.nextDate, kind: data.nextKind || f.kind, purpose: data.nextPurpose, assignedTo: f.assignedTo || actor.user.id }, actor);
    }
    return { done: true };
  }

  cancelFollowUp(id, actor) {
    const f = this.#followUp(id, actor);
    need(actor, f.leadId ? 'crm.leads.edit' : 'crm.activities.create');
    db().prepare("UPDATE crm_followups SET status = 'cancelled' WHERE id = ?").run(id);
    return { cancelled: true };
  }

  /** Open follow-ups: overdue, today and upcoming (next 7 days) for me, or everyone (managers). */
  followUps(query, actor) {
    if (!can(actor, 'crm.leads.view') && !can(actor, 'crm.activities.view')) need(actor, 'crm.leads.view');
    const today = istDate();
    const where = ["f.status = 'open'", "(l.id IS NULL OR l.stage NOT IN ('won', 'lost'))"];
    const params = [];
    if (!seesAll(actor) || query.mine !== '0') {
      where.push('f.assigned_to = ?');
      params.push(actor.user.id);
    }
    if (!can(actor, 'crm.leads.view')) where.push('f.lead_id IS NULL');
    if (!can(actor, 'crm.activities.view')) where.push('f.customer_id IS NULL');
    const rows = db().prepare(`${FOLLOWUP_SELECT} WHERE ${where.join(' AND ')} AND f.due_date <= date(?, '+7 days') ORDER BY f.due_date, f.created_at`)
      .all(...params, today).map(mapFollowUp);
    return {
      today,
      overdue: rows.filter((f) => f.dueDate < today),
      dueToday: rows.filter((f) => f.dueDate === today),
      upcoming: rows.filter((f) => f.dueDate > today),
    };
  }

  /** A customer's CRM activity, follow-ups, invoices and receipts, newest first. */
  customerTimeline(customerId, actor) {
    need(actor, 'crm.activities.view');
    const customer = this.#customer(customerId);
    const items = [];
    for (const a of db().prepare('SELECT * FROM crm_activities WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200').all(customerId)) {
      items.push({ type: 'activity', at: a.created_at, ...mapActivity(a) });
    }
    if (can(actor, 'pos.sales.view')) {
      for (const s of db().prepare(`SELECT id, invoice_number, grand_total, status, payment_status, created_at FROM pos_sales
        WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100`).all(customerId)) {
        items.push({ type: 'invoice', at: s.created_at, id: s.id, number: s.invoice_number, amount: Number(s.grand_total || 0), status: s.status, paymentStatus: s.payment_status });
      }
    }
    if (can(actor, 'parties.customer_receipts.view')) {
      for (const r of db().prepare(`SELECT id, voucher_number, amount, payment_mode, receipt_date, created_at FROM customer_receipts
        WHERE customer_id = ? AND status = 'posted' ORDER BY receipt_date DESC LIMIT 100`).all(customerId)) {
        items.push({ type: 'receipt', at: r.created_at || r.receipt_date, id: r.id, number: r.voucher_number, amount: Number(r.amount || 0), mode: r.payment_mode });
      }
    }
    for (const l of db().prepare('SELECT id, name, stage, created_at FROM crm_leads WHERE customer_id = ?').all(customerId)) {
      items.push({ type: 'lead', at: l.created_at, id: l.id, name: l.name, stage: l.stage });
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      followUps: db().prepare(`${FOLLOWUP_SELECT} WHERE f.customer_id = ? AND f.status = 'open' ORDER BY f.due_date`).all(customerId).map(mapFollowUp),
      items,
    };
  }

  /** Counts for the CRM header. */
  summary(actor) {
    need(actor, 'crm.leads.view');
    const today = istDate();
    const mine = seesAll(actor) ? '' : ' AND (l.assigned_to = @me OR l.created_by = @me)';
    const mineF = seesAll(actor) ? '' : ' AND f.assigned_to = @me';
    const p = { me: actor.user.id, today, month: today.slice(0, 7) };
    const one = (sql) => db().prepare(sql).get(p);
    return {
      openLeads: one(`SELECT COUNT(*) c, COALESCE(SUM(expected_value), 0) v FROM crm_leads l WHERE stage NOT IN ('won','lost')${mine}`),
      wonThisMonth: one(`SELECT COUNT(*) c, COALESCE(SUM(expected_value), 0) v FROM crm_leads l WHERE stage = 'won' AND substr(closed_at, 1, 7) = @month${mine}`),
      dueToday: one(`SELECT COUNT(*) c FROM crm_followups f LEFT JOIN crm_leads l ON l.id = f.lead_id WHERE f.status = 'open' AND f.due_date = @today AND (l.id IS NULL OR l.stage NOT IN ('won','lost'))${mineF}`).c,
      overdue: one(`SELECT COUNT(*) c FROM crm_followups f LEFT JOIN crm_leads l ON l.id = f.lead_id WHERE f.status = 'open' AND f.due_date < @today AND (l.id IS NULL OR l.stage NOT IN ('won','lost'))${mineF}`).c,
      seesAll: seesAll(actor),
    };
  }
}

export const crmService = new CrmService();
