# GitHub repository rename: tracinvent → sacone

The local git remote is already set to:

```
https://github.com/playersaksham117/sacone.git
```

## Rename on GitHub (one-time)

1. Open **https://github.com/playersaksham117/tracinvent/settings**
2. Under **Repository name**, change `tracinvent` to **`sacone`**
3. Click **Rename**

GitHub keeps redirects from the old URL, so existing clones keep working until you update the remote.

## Or use GitHub CLI

```bash
gh auth login
gh repo rename sacone --repo playersaksham117/tracinvent
git remote set-url origin https://github.com/playersaksham117/sacone.git
```

## Push local SACONE changes

From the repo root (`BillEase Suite/`):

```bash
git add SACONE/
git commit -m "Rename TracInvent branding to SACONE and update GitHub remote"
git push -u origin main
```

After the GitHub rename, pushes go to **playersaksham117/sacone**.
