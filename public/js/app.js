const api = {
  async call(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  },
  get: (url) => api.call('GET', url),
  post: (url, body) => api.call('POST', url, body),
  del: (url) => api.call('DELETE', url),
};

let state = { domains: [] };

(async function init() {
  try {
    const session = await api.get('/api/session');
    if (session.loggedIn) showApp(); else showLogin();
  } catch {
    showLogin();
  }
})();

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  loadDomains();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  try {
    await api.post('/api/login', { email, password });
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api.post('/api/logout');
  showLogin();
});

document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
  el.addEventListener('click', () => switchView(el.dataset.view));
});

function switchView(name) {
  document.querySelectorAll('.nav-item[data-view]').forEach((el) =>
    el.classList.toggle('active', el.dataset.view === name));
  document.querySelectorAll('main > .view').forEach((el) => el.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  if (name === 'domains') loadDomains();
}

document.getElementById('backToDomains').addEventListener('click', () => switchView('domains'));

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

async function loadDomains() {
  const domains = await api.get('/api/domains');
  state.domains = domains;
  const container = document.getElementById('domainsList');

  if (!domains.length) {
    container.innerHTML = `<div class="empty">No domains yet. Add one above to get started.</div>`;
    return;
  }

  container.innerHTML = domains.map((d) => `
    <div class="card domain-row">
      <span class="name"><a href="#" data-id="${d.id}" class="open-domain">${d.name}</a></span>
      <span class="status-pill ${d.verified ? 'verified' : 'pending'}">
        <span class="pulse"></span>${d.verified ? 'Verified' : 'Pending verification'}
      </span>
    </div>
  `).join('');

  container.querySelectorAll('.open-domain').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openDomain(Number(a.dataset.id));
    });
  });
}

document.getElementById('addDomainForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newDomainInput');
  const errorEl = document.getElementById('addDomainError');
  errorEl.textContent = '';
  try {
    await api.post('/api/domains', { name: input.value.trim() });
    input.value = '';
    loadDomains();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function openDomain(id) {
  const domains = await api.get('/api/domains');
  state.domains = domains;
  const domain = domains.find((d) => d.id === id);
  if (!domain) return;
  switchView('domain-detail');
  renderDomainDetail(domain);
}

function renderDomainDetail(d) {
  document.getElementById('detailDomainName').textContent = d.name;
  document.getElementById('detailDomainStatus').textContent = d.verified
    ? `Verified on ${new Date(d.verified_at).toLocaleDateString()}`
    : 'Not verified yet - add the TXT record below.';

  const verifyBlock = document.getElementById('verifyBlock');
  const verifiedBlock = document.getElementById('verifiedBlock');

  if (d.verified) {
    verifyBlock.innerHTML = '';
    verifiedBlock.style.display = 'block';
    document.getElementById('deleteVerifiedDomainBtn').onclick = async () => {
      if (!confirm(`Remove ${d.name}?`)) return;
      await api.del(`/api/domains/${d.id}`);
      switchView('domains');
    };
    return;
  }

  verifiedBlock.style.display = 'none';
  verifyBlock.innerHTML = `
    <div class="section-title">Verify ownership</div>
    <div class="card">
      <p style="margin-top:0; color:var(--muted); font-size:14px;">
        Add this TXT record at the root (<code>@</code>) of <strong>${d.name}</strong>, then confirm below.
        DNS changes usually take a few minutes, sometimes longer.
      </p>
      <div class="dns-block">
        <div class="dns-row"><span class="dns-label">Type</span><span class="dns-value">TXT</span></div>
        <div class="dns-row"><span class="dns-label">Host</span><span class="dns-value">@ (root)</span></div>
        <div class="dns-row">
          <span class="dns-label">Value</span>
          <span class="dns-value">${d.txt_record_value}</span>
          <button class="copy-btn" id="copyTxtBtn">Copy</button>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn" id="checkVerifyBtn">I've added it - check now</button>
        <button class="btn danger" id="deleteDomainBtn">Remove domain</button>
      </div>
      <div class="error-text" id="verifyMsg"></div>
    </div>
  `;

  document.getElementById('copyTxtBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(d.txt_record_value);
    toast('Copied to clipboard');
  });

  document.getElementById('checkVerifyBtn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
      const result = await api.post(`/api/domains/${d.id}/verify`);
      if (result.verified) {
        toast('Domain verified');
        await openDomain(d.id);
        loadDomains();
      } else {
        document.getElementById('verifyMsg').textContent = result.message;
      }
    } catch (err) {
      document.getElementById('verifyMsg').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "I've added it - check now";
    }
  });

  document.getElementById('deleteDomainBtn').addEventListener('click', async () => {
    if (!confirm(`Remove ${d.name}?`)) return;
    await api.del(`/api/domains/${d.id}`);
    switchView('domains');
  });
}
