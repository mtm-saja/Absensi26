/*******************************************************
 * ABSENSI ONLINE - FRONTEND LOGIC (REFACTORED)
 * v12.0 - Ramping, Cepat, Login 1 Pintu
 *******************************************************/

const API_URL = 'https://script.google.com/macros/s/AKfycbzRXixyBTReL7VkJc0hsQ7GeQiPI5UZNB0pYbX20XGQJoLhJHKhRJHwVBZmrHCiYMXd/exec';
const LS_KEY = 'absensi_session_v12';

/* ============ STATE ============ */
let currentUser = null;
let currentSesiList = [];
let currentSesiAktif = null;
let statusHariIni = { isLibur: false, isSesiAktif: false };
let fiturGlobal = {};
let qrScanner = null, qrScanning = false;
let lastScan = { code: '', time: 0 };
let timers = { sesi: null, rekap: null, riwayat: null, clock: null };
let izinFpData = [];
let guruMapelList = [], guruKelasList = [];
let currentSiswaInput = [];
let rekapDataCache = [], daftarNilaiCache = [];

/* ============ CACHE API ============ */
const apiCache = new Map();
const CACHE_TTL = 30000; // 30 detik

async function api(action, payload = {}, useCache = false) {
  const key = action + ':' + JSON.stringify(payload);
  if (useCache) {
    const c = apiCache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL) return c.data;
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, ...payload }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const data = await res.json();
    if (useCache) apiCache.set(key, { data, ts: Date.now() });
    return data;
  } catch (e) {
    return { ok: false, msg: 'Koneksi gagal: ' + e.message };
  }
}

/* ============ POPUP ============ */
function showLoading(text = 'Memproses...') {
  const ov = document.getElementById('popupOverlay');
  const box = document.getElementById('popupBox');
  box.className = 'popup-box';
  document.getElementById('popupIcon').innerHTML = '<div class="spinner"></div>';
  document.getElementById('popupContent').innerHTML = '<div class="text">' + text + '</div>';
  document.getElementById('popupClose').classList.add('hidden');
  ov.classList.remove('hidden');
}
function showPopup(text, ok = true, autoCloseMs = 1500) {
  const ov = document.getElementById('popupOverlay');
  const box = document.getElementById('popupBox');
  box.className = 'popup-box ' + (ok ? 'ok' : 'err');
  document.getElementById('popupIcon').textContent = ok ? '✅' : '❌';
  document.getElementById('popupContent').innerHTML = '<div class="text">' + text + '</div>';
  document.getElementById('popupClose').classList.remove('hidden');
  ov.classList.remove('hidden');
  if (autoCloseMs > 0) {
    clearTimeout(window._popupTimer);
    window._popupTimer = setTimeout(closePopup, autoCloseMs);
  }
}
function closePopup() {
  document.getElementById('popupOverlay').classList.add('hidden');
  clearTimeout(window._popupTimer);
}

/* ============ SIDEBAR & USER MENU ============ */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const main = document.getElementById('mainContent');
  if (!sidebar) return;
  if (window.innerWidth <= 992) {
    sidebar.classList.toggle('open');
    overlay?.classList.toggle('show');
  } else {
    sidebar.classList.toggle('closed');
    main?.classList.toggle('full');
  }
}
function toggleUserMenu() { document.getElementById('userDropdown')?.classList.toggle('open'); }
function closeUserMenu() { document.getElementById('userDropdown')?.classList.remove('open'); }
document.addEventListener('click', (e) => {
  const ud = document.getElementById('userDropdown');
  if (ud && !e.target.closest('.user-btn') && !e.target.closest('#userDropdown')) ud.classList.remove('open');
});

/* ============ LOGIN ============ */
function showLoginPopup() {
  if (currentUser) { showPopup('Anda sudah login sebagai ' + currentUser.user.nama, false, 2000); return; }
  document.getElementById('loginModalOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('loginInput')?.focus(), 200);
}
function closeLoginPopup() {
  document.getElementById('loginModalOverlay').classList.add('hidden');
  document.getElementById('loginInput').value = '';
}
async function doLogin() {
  const val = document.getElementById('loginInput').value.trim();
  if (!val) { showPopup('Input wajib diisi', false); return; }
  if (!/^\d{4}$/.test(val) && !/^\d{8,10}$/.test(val)) { showPopup('Format salah. NISN 8–10 digit / PIN 4 digit.', false); return; }
  showLoading('Memverifikasi login...');
  const payload = /^\d{4}$/.test(val) ? { id: '', pin: val } : { id: val, pin: '' };
  const r = await api('login', payload);
  if (!r.ok) { showPopup(r.msg, false, 2000); return; }
  currentUser = r;
  saveSession();
  closeLoginPopup();
  applyUserToUI();
  apiCache.clear();
  await muatFitur();
  showPopup('Login Berhasil! Halo ' + r.user.nama, true, 1500);
  if (r.role === 'siswa') showPage('sidikJariSiswa');
  else if (r.role === 'guru') showPage('qr');
  else if (r.role === 'admin') showPage('pengaturan');
}
function doLogout() {
  qrTutupKamera();
  Object.values(timers).forEach(t => t && clearInterval(t));
  const ov = document.getElementById('popupOverlay');
  const box = document.getElementById('popupBox');
  box.className = 'popup-box';
  document.getElementById('popupIcon').textContent = '🚪';
  document.getElementById('popupContent').innerHTML = '<div class="text">Yakin ingin logout?</div><div class="d-flex" style="gap:8px;justify-content:center;margin-top:14px;"><button class="btn btn-secondary btn-sm" id="logoutCancel">Batal</button><button class="btn btn-danger btn-sm" id="logoutConfirm">Ya, Logout</button></div>';
  document.getElementById('popupClose').classList.add('hidden');
  ov.classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('logoutCancel').onclick = closePopup;
    document.getElementById('logoutConfirm').onclick = () => {
      closePopup();
      currentUser = null;
      localStorage.removeItem(LS_KEY);
      apiCache.clear();
      applyUserToUI();
      showPage('dashboard');
      startWatchers();
      setTimeout(() => showPopup('Logout berhasil', true, 1500), 200);
    };
  }, 50);
}
function saveSession() {
  if (!currentUser) return localStorage.removeItem(LS_KEY);
  localStorage.setItem(LS_KEY, JSON.stringify({ ...currentUser, ts: Date.now() }));
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!s) return null;
    if (Date.now() - s.ts > 12 * 60 * 60 * 1000) { localStorage.removeItem(LS_KEY); return null; }
    return s;
  } catch { return null; }
}

/* ============ INIT ============ */
window.addEventListener('DOMContentLoaded', async () => {
  startClock();
  await muatFitur();
  await muatSesi();
  await refreshStatusHariIni();
  const s = loadSession();
  if (s) { currentUser = s; applyUserToUI(); }
  showPage('dashboard');
  startWatchers();
  isiDropdownKelasCari();
});

function startWatchers() {
  refreshSesiAktif();
  muatRekapRealtime();
  muatRiwayat();
  timers.sesi = setInterval(() => { refreshSesiAktif(); refreshStatusHariIni(); }, 60000);
  timers.rekap = setInterval(muatRekapRealtime, 60000);
  timers.riwayat = setInterval(muatRiwayat, 120000);
}

function startClock() {
  const update = () => {
    const el = document.getElementById('topbarDateTime');
    if (!el) return;
    const n = new Date();
    const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][n.getDay()];
    const bln = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][n.getMonth()];
    el.textContent = `${hari}, ${n.getDate()} ${bln} ${n.getFullYear()} || ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  };
  update();
  timers.clock = setInterval(update, 1000);
}

/* ============ APPLY USER TO UI ============ */
function applyUserToUI() {
  const role = currentUser?.role;
  const nama = currentUser?.user.nama || 'Belum Login';
  document.getElementById('topbarUserName').textContent = nama;
  document.getElementById('topbarSubtitle').textContent = currentUser ? nama : 'Dashboard';

  // Tampilkan/sembunyikan tombol login & logout di dropdown
  document.getElementById('userMenuLogin')?.classList.toggle('hidden', !!currentUser);
  document.getElementById('userMenuLogout')?.classList.toggle('hidden', !currentUser);

  // Update semua nav-link dengan data-role
  document.querySelectorAll('.nav-link[data-role]').forEach(el => {
    const needRole = el.dataset.role;
    const allowed = role === needRole || (needRole === 'guru' && role === 'admin');
    el.classList.toggle('locked', !allowed);
  });

  // Admin: enable opsi guru di select
  const optG = document.getElementById('izinRoleGuruOpt'); if (optG) optG.disabled = role !== 'admin';
  const optRG = document.getElementById('rekapRoleGuruOpt'); if (optRG) optRG.disabled = role !== 'admin';
  document.getElementById('adminScanTargetBox')?.classList.toggle('hidden', role !== 'admin');

  if (role === 'siswa') updateFingerprintButton('siswa');
  if (role === 'guru') updateFingerprintButton('guru');
  isiDropdownKelasRekap();
}

/* ============ PAGE ROUTER ============ */
const PAGE_TITLES = {
  dashboard:'Dashboard', cariSiswa:'Cari Data Siswa',
  sidikJariSiswa:'Absensi Sidik Jari (Siswa)', syarat:'Cek Syarat Naik Kelas / Lulus',
  qr:'QR Barcode Scanner', sidikJariGuru:'Absensi Sidik Jari (Guru)',
  izin:'Input Izin / Sakit', rekap:'Rekap Absensi',
  inputNilai:'Input Nilai', daftarNilai:'Daftar Nilai',
  kelulusan:'Cek Kelulusan', pengaturan:'Pengaturan Sistem'
};

function navigate(pageId, el) {
  if (!currentUser) {
    showPopup('🔒 Kamu Belum Login', false, 2000);
    return;
  }
  const needRole = el?.dataset?.role;
  if (needRole && currentUser.role !== needRole && !(needRole === 'guru' && currentUser.role === 'admin')) {
    showPopup('Anda login sebagai ' + currentUser.role + ', tidak bisa akses menu ini', false, 2000);
    return;
  }
  showPage(pageId, el);
}

function showPage(pageId, el) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('page-' + pageId)?.classList.remove('hidden');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[pageId] || pageId;
  document.getElementById('pageBreadcrumb').textContent = PAGE_TITLES[pageId] || pageId;

  document.querySelectorAll('.sidebar-menu .nav-link').forEach(a => a.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    document.querySelector(`.nav-link[data-page="${pageId}"]`)?.classList.add('active');
  }

  if (window.innerWidth <= 992) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
  }

  // Lazy load per halaman
  const loaders = {
    dashboard: () => { muatRiwayat(); muatRekapRealtime(); refreshSesiAktif(); refreshStatusHariIni(); },
    cariSiswa: () => isiDropdownKelasCari(),
    sidikJariSiswa: renderSesiBannerEls,
    sidikJariGuru: renderSesiBannerEls,
    qr: renderSesiBannerEls,
    izin: muatSesi,
    rekap: isiDropdownKelasRekap,
    inputNilai: initGuruNilai,
    daftarNilai: initGuruNilai,
    pengaturan: adminLoadAll
  };
  loaders[pageId]?.();
}

/* ============ FITUR & SESI ============ */
async function muatFitur() {
  const r = await api('getFitur', {}, true);
  if (r.ok) fiturGlobal = r.fitur;
}
async function muatSesi() {
  const r = await api('getSesi', {}, true);
  if (!r.ok) return;
  currentSesiList = r.sesi;
  const opts = r.sesi.map(s => `<option value="${s.sesi}">${s.sesi} (TW ${s.mulaiTW}-${s.batasTW} | TL ${s.batasTW}-${s.batasTL})</option>`).join('');
  const el = document.getElementById('izinSesiSelect');
  if (el) el.innerHTML = opts || '<option value="">(Belum ada sesi)</option>';
}
async function refreshSesiAktif() {
  const r = await api('getSesiAktif', {}, true);
  currentSesiAktif = r.ok ? r : null;
  renderSesiBannerEls();
}
async function refreshStatusHariIni() {
  const r = await api('getStatusHariIni', {}, true);
  if (r.ok) statusHariIni = r;
  renderSesiBannerEls();
  handleRiwayatVisibility();
}
function renderSesiBannerEls() {
  const ids = ['sesiBannerContainer','siswaSesiBanner','guruSesiBanner','guruFpSesiBanner'];
  const isLibur = statusHariIni?.isLibur;
  const noSesi = !currentSesiAktif;
  let html;
  if (isLibur) {
    html = `<div class="sesi-banner err"><div class="label">Status Hari Ini</div><div class="name">🏖️ ${statusHariIni.keteranganLibur || 'Hari Libur'}</div><div class="time">Selamat beristirahat — tidak ada absensi hari ini</div></div>`;
  } else if (noSesi) {
    html = `<div class="sesi-banner warn"><div class="label">Status Sesi</div><div class="name">Tidak Ada Sesi</div><div class="time">Saat ini tidak ada sesi berlangsung</div></div>`;
  } else {
    const s = currentSesiAktif.info, st = currentSesiAktif.status;
    let cls = 'sesi-banner', tag = '';
    if (st === 'TW') tag = '🟢 Tepat Waktu';
    else if (st === 'TL') { cls += ' warn'; tag = '🟡 Terlambat'; }
    else { cls += ' err'; tag = '🔴 Ditutup'; }
    html = `<div class="${cls}"><div class="label">Sesi Berlangsung</div><div class="name">${s.sesi}</div><div class="time">TW ${s.mulaiTW}-${s.batasTW} | TL ${s.batasTW}-${s.batasTL}</div><div class="status-tag">${tag}</div></div>`;
  }
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}
function handleRiwayatVisibility() {
  const wrap = document.getElementById('riwayatTableWrap');
  const closed = document.getElementById('riwayatClosedMsg');
  if (!wrap) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const sesiPertama = currentSesiList?.[0];
  const belumMulai = sesiPertama && hhmm < sesiPertama.mulaiTW;
  const isLibur = statusHariIni?.isLibur;
  const noSesi = !currentSesiAktif;
  if (isLibur || (noSesi && belumMulai)) {
    wrap.classList.add('hidden');
    closed.classList.remove('hidden');
    closed.innerHTML = isLibur
      ? '<i class="bi bi-sun fs-4 d-block mb-1"></i><strong>Hari Libur</strong><br><span class="small">Tidak ada absensi hari ini.</span>'
      : '<i class="bi bi-moon-stars fs-4 d-block mb-1"></i><strong>Sesi Belum Dimulai</strong><br><span class="small">Belum ada riwayat saat ini.</span>';
  } else {
    wrap.classList.remove('hidden');
    closed.classList.add('hidden');
  }
}

/* ============ REKAP REALTIME ============ */
async function muatRekapRealtime() {
  const r = await api('rekapRealtime', {}, true);
  if (!r.ok) return;
  const el = document.getElementById('rekapRealtimeContainer');
  if (el) el.innerHTML = renderRekapHTML(r.sesi);
}
function renderRekapHTML(sesiData) {
  if (!sesiData?.length) return '<div class="text-muted small">Belum ada sesi.</div>';
  let html = '<div class="rekap-card"><div class="rekap-title">📊 REKAP HARI INI</div>';
  sesiData.forEach(s => {
    html += '<div style="margin-bottom:10px;"><div class="rekap-sesi-title">' + s.sesi + '</div><table class="rekap-table"><thead><tr><th>Peran</th><th>TW</th><th>TL</th><th>S</th><th>I</th><th>A</th><th>B</th><th>%</th></tr></thead><tbody>';
    const row = (label, stat) => {
      const p = stat.persen;
      const cls = p >= 80 ? 'ok' : (p >= 60 ? 'warn' : 'bad');
      return `<tr><td>${label}</td><td>${stat.TW||'-'}</td><td>${stat.TL||'-'}</td><td>${stat.S||'-'}</td><td>${stat.I||'-'}</td><td>${stat.A||'-'}</td><td>${stat.B||'-'}</td><td class="persen ${cls}">${p}%</td></tr>`;
    };
    html += row('Guru', s.guru) + row('Siswa', s.siswa) + '</tbody></table></div>';
  });
  return html + '</div>';
}

/* ============ RIWAYAT ============ */
async function muatRiwayat() {
  const r = await api('riwayatGlobal', {}, true);
  if (!r.ok) return;
  const { sesi: sesiList, data } = r;
  let head = '<tr><th>No</th><th>Nama</th><th>Role</th>';
  sesiList.forEach(s => { head += '<th>' + s + '</th>'; });
  head += '</tr>';
  document.getElementById('riwayatTableHead').innerHTML = head;
  const tbody = document.getElementById('riwayatTableBody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="${3 + sesiList.length}" class="text-center text-muted p-3">Belum ada data</td></tr>`;
    return;
  }
  const sorted = data.slice().sort((a, b) => a.role === b.role ? 0 : (a.role === 'siswa' ? -1 : 1));
  tbody.innerHTML = sorted.map((u, i) => {
    let row = `<td>${i+1}</td><td>${u.nama}</td><td><span class="badge badge-role-${u.role}">${u.role}</span></td>`;
    sesiList.forEach(s => {
      const info = u.sesi[s] || { status: '-', jam: '' };
      const st = info.status;
      let label = st;
      if (st === 'ALPA') label = 'A';
      else if (st === 'BOLOS') label = 'B';
      else if (st === 'BELUM' || st === '-') label = '—';
      const cls = (st === 'BELUM' || st === '-') ? 'badge-BELUM' : 'badge-' + st;
      const jam = info.jam ? `<br><small class="text-muted">${info.jam}</small>` : '';
      row += `<td><span class="badge ${cls}">${label}</span>${jam}</td>`;
    });
    return `<tr>${row}</tr>`;
  }).join('');
}

/* ============ CARI SISWA (debounce) ============ */
let cariTimer = null;
function isiDropdownKelasCari() {
  api('listKelas', {}, true).then(r => {
    if (!r.ok) return;
    const el = document.getElementById('cariSiswaKelas');
    if (!el) return;
    el.innerHTML = '<option value="">Semua Kelas</option>' + r.kelas.map(k => `<option value="${k}">${k}</option>`).join('');
  });
}
document.addEventListener('input', (e) => {
  if (['cariSiswaInput','cariSiswaKelas','cariSiswaDari','cariSiswaSampai'].includes(e.target.id)) {
    clearTimeout(cariTimer);
    cariTimer = setTimeout(doCariSiswa, 400);
  }
});
document.addEventListener('change', (e) => {
  if (['cariSiswaKelas','cariSiswaDari','cariSiswaSampai'].includes(e.target.id)) doCariSiswa();
});
async function doCariSiswa() {
  const q = document.getElementById('cariSiswaInput').value.trim();
  const kelas = document.getElementById('cariSiswaKelas').value;
  const dari = document.getElementById('cariSiswaDari').value;
  const sampai = document.getElementById('cariSiswaSampai').value;
  const el = document.getElementById('cariSiswaHasil');
  if (!q && !kelas && !dari && !sampai) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="text-muted small">Mencari...</div>';
  const r = await api('cariSiswa', { q, kelas, dari, sampai });
  if (!r.ok) { el.innerHTML = `<div class="alert alert-danger small">${r.msg}</div>`; return; }
  if (!r.data.length) { el.innerHTML = '<div class="alert alert-warning small">Tidak ada siswa yang cocok.</div>'; return; }
  el.innerHTML = '<table><thead><tr><th>No</th><th>Nama</th><th>Tanggal</th><th>TW</th><th>TL</th><th>S</th><th>I</th><th>A</th><th>B</th></tr></thead><tbody>' +
    r.data.map((s, i) => `<tr><td>${i+1}</td><td><strong>${s.nama}</strong><br><small class="text-muted">${s.nisn} • ${s.kelas}</small></td><td><small>${s.periode||'-'}</small></td><td class="text-center">${s.TW}</td><td class="text-center">${s.TL}</td><td class="text-center">${s.S}</td><td class="text-center">${s.I}</td><td class="text-center text-danger">${s.A}</td><td class="text-center text-danger">${s.B}</td></tr>`).join('') +
    '</tbody></table>';
}

/* ============ FINGERPRINT ============ */
function updateFingerprintButton(who) {
  if (!currentUser) return;
  const btn = document.getElementById(who === 'siswa' ? 'btnFingerprint' : 'guruBtnFingerprint');
  if (!btn) return;
  btn.innerHTML = currentUser.hasFingerprint
    ? '<i class="bi bi-fingerprint"></i> Absen Sidik Jari'
    : '<i class="bi bi-fingerprint"></i> Daftarkan Sidik Jari';
}
const b64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));

async function handleFingerprint() { await prosesFingerprint('siswa'); }
async function handleGuruFingerprint() { await prosesFingerprint('guru'); }

async function prosesFingerprint(role) {
  if (!currentUser || currentUser.role !== role) { showPopup(`Login sebagai ${role} dulu`, false); return; }
  if (!currentSesiAktif) { showPopup('Tidak ada sesi berlangsung', false); return; }
  showLoading('Memeriksa izin...');
  const cek = await api('cekIzinFpUser', { id: currentUser.user.id });
  if (!cek.ok || !cek.allowed) { showPopup('Anda tidak diizinkan absen sidik jari hari ini.', false, 2500); return; }
  if (!window.PublicKeyCredential) { showPopup('HP tidak mendukung sidik jari', false); return; }
  const sesi = currentSesiAktif.sesi;
  try {
    if (!currentUser.hasFingerprint) {
      showLoading('Mendaftarkan sidik jari...');
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Absensi Online' },
          user: { id: new TextEncoder().encode(currentUser.user.id), name: currentUser.user.id, displayName: currentUser.user.nama },
          pubKeyCredParams: [{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}],
          authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
          timeout: 60000, attestation: 'none'
        }
      });
      if (!cred) throw new Error('Registrasi dibatalkan');
      const reg = await api('registerFingerprint', { id: currentUser.user.id, nama: currentUser.user.nama, role, credentialId: b64(cred.rawId), publicKey: '' });
      if (!reg.ok) { showPopup(reg.msg, false); return; }
      currentUser.hasFingerprint = true;
      saveSession();
      updateFingerprintButton(role);
      showPopup('✅ Sidik jari terdaftar. Tekan lagi untuk absen.', true, 2000);
    } else {
      showLoading('Verifikasi sidik jari...');
      await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), timeout: 60000, userVerification: 'required' } });
      const r = await api('absenFingerprint', { id: currentUser.user.id, nama: currentUser.user.nama, role, sesi });
      showPopup(r.msg, r.ok, r.ok ? 1200 : 2200);
      if (r.ok) { navigator.vibrate?.(200); apiCache.clear(); muatRiwayat(); muatRekapRealtime(); }
    }
  } catch (e) {
    showPopup(e.name === 'NotAllowedError' ? 'Dibatalkan / tidak ada sidik jari' : 'Error: ' + e.message, false, 2500);
  }
}

/* ============ QR SCANNER ============ */
function onQRModeChange() {
  const manual = document.getElementById('qrModeScan').value === 'manual';
  document.getElementById('qrManualBox').classList.toggle('hidden', !manual);
  document.getElementById('qrKameraBox').classList.toggle('hidden', manual);
  if (manual) qrTutupKamera();
}
async function qrBukaKamera() {
  if (qrScanning) return;
  try {
    qrScanner = new Html5Qrcode("guruReader");
    qrScanning = true;
    await qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, onQRScanSuccess, () => {});
    document.getElementById('qrBtnBuka').disabled = true;
  } catch (e) { qrScanning = false; showPopup('Gagal buka kamera: ' + e.message, false); }
}
async function qrTutupKamera() {
  if (qrScanner && qrScanning) {
    try { await qrScanner.stop(); await qrScanner.clear(); } catch {}
    qrScanning = false;
  }
  const b = document.getElementById('qrBtnBuka');
  if (b) b.disabled = false;
}
function onQRScanSuccess(txt) {
  const now = Date.now();
  if (txt === lastScan.code && now - lastScan.time < 3000) return;
  lastScan = { code: txt, time: now };
  qrProsesScan(txt);
}
async function qrProsesScan(barcode) {
  if (!currentSesiAktif) { showPopup('Tidak ada sesi berlangsung', false); return; }
  showLoading('Memproses absensi...');
  const r = await api('scan', { scannerRole: currentUser.role, scannerId: currentUser.user.id, barcode: String(barcode), sesi: currentSesiAktif.sesi });
  showPopup(r.msg, r.ok, r.ok ? 1200 : 2200);
  if (r.ok) { navigator.vibrate?.(200); apiCache.clear(); muatRiwayat(); muatRekapRealtime(); }
}
function qrSubmitManual() {
  const v = document.getElementById('qrManualBarcode').value.trim();
  if (!v) return;
  qrProsesScan(v);
  document.getElementById('qrManualBarcode').value = '';
}

/* ============ IZIN ============ */
async function simpanIzin() {
  const role = document.getElementById('izinRole').value;
  const id = document.getElementById('izinId').value.trim();
  const nama = document.getElementById('izinNama').value.trim();
  const sesi = document.getElementById('izinSesiSelect').value;
  const ket = document.getElementById('izinKet').value;
  if (!id || !nama || !sesi) { showPopup('ID, Nama, dan Sesi wajib diisi', false); return; }
  if (currentUser.role === 'guru' && role === 'guru') { showPopup('Guru tidak bisa input izin guru', false); return; }
  showLoading('Menyimpan izin...');
  const r = await api('simpanIzin', { role, id, nama, sesi, keterangan: ket });
  if (r.ok) { document.getElementById('izinId').value = ''; document.getElementById('izinNama').value = ''; apiCache.clear(); muatRiwayat(); muatRekapRealtime(); }
  showPopup(r.msg, r.ok);
}

/* ============ REKAP PERIODE ============ */
async function isiDropdownKelasRekap() {
  const el = document.getElementById('rekapKelas');
  if (!el) return;
  let list = [];
  if (currentUser?.role === 'guru') {
    const r = await api('getKelasGuru', { nip: currentUser.user.id }, true);
    list = r.ok ? r.kelas : [];
  } else if (currentUser?.role === 'admin') {
    const r = await api('listKelas', {}, true);
    list = r.ok ? r.kelas : [];
  }
  el.innerHTML = '<option value="">Semua Kelas</option>' + list.map(k => `<option value="${k}">${k}</option>`).join('');
}
async function muatRekapPeriode() {
  const dari = document.getElementById('rekapDari').value;
  const sampai = document.getElementById('rekapSampai').value;
  const role = document.getElementById('rekapRole').value;
  const kelas = document.getElementById('rekapKelas').value;
  if (!dari || !sampai) { showPopup('Isi tanggal dari & sampai', false); return; }
  if (currentUser.role === 'guru' && role === 'guru') { showPopup('Guru tidak bisa lihat rekap guru', false); return; }
  const el = document.getElementById('rekapPeriodeHasil');
  el.innerHTML = '<div class="text-muted small">Memuat...</div>';
  const r = await api('rekapPeriode', { dari, sampai, role, kelas });
  if (!r.ok) { el.innerHTML = `<div class="alert alert-danger small">${r.msg}</div>`; return; }
  if (!r.data.length) { el.innerHTML = '<div class="alert alert-warning small">Tidak ada data.</div>'; rekapDataCache = []; return; }
  rekapDataCache = r.data;
  el.innerHTML = '<table><thead><tr><th>No</th><th>Nama</th><th>TW</th><th>TL</th><th>I</th><th>S</th><th>A</th><th>B</th><th>%</th></tr></thead><tbody>' +
    r.data.map((u, i) => {
      const p = u.persen;
      const cls = p >= 80 ? 'text-success fw-bold' : (p >= 60 ? 'text-warning fw-bold' : 'text-danger fw-bold');
      return `<tr><td>${i+1}</td><td>${u.nama}</td><td>${u.TW}</td><td>${u.TL}</td><td>${u.IZIN}</td><td>${u.SAKIT}</td><td>${u.ALPA}</td><td>${u.BOLOS}</td><td class="${cls}">${p}%</td></tr>`;
    }).join('') + '</tbody></table>';
}

/* ============ EXPORT ============ */
function getNamaFile(prefix) {
  const n = new Date();
  return prefix + '_' + n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
}
function tableToArray(table) {
  return Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('th, td')).map(c => c.innerText.trim().replace(/\s+/g, ' '))
  ).filter(r => r.length);
}
async function exportRekapExcel() {
  if (!rekapDataCache.length) { showPopup('Tampilkan data rekap dulu', false, 2000); return; }
  const dari = document.getElementById('rekapDari').value || '-';
  const sampai = document.getElementById('rekapSampai').value || '-';
  const role = document.getElementById('rekapRole').value || 'siswa';
  const kelas = document.getElementById('rekapKelas').value || 'Semua';
  showLoading('Menyiapkan Excel...');
  const head = [['No','Nama','TW','TL','IZIN','SAKIT','ALPA','BOLOS','% Hadir']];
  const body = rekapDataCache.map((u, i) => [i+1, u.nama, u.TW, u.TL, u.IZIN, u.SAKIT, u.ALPA, u.BOLOS, u.persen + '%']);
  const info = [['REKAP ABSENSI ' + role.toUpperCase()],['Periode:', dari + ' s/d ' + sampai],['Kelas:', kelas],['Sekolah:', 'SMPN 8 Ciparasi'],['Diekspor:', new Date().toLocaleString('id-ID')],[]];
  const ws = XLSX.utils.aoa_to_sheet(info.concat(head).concat(body));
  ws['!cols'] = [{wch:6},{wch:30},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi');
  XLSX.writeFile(wb, getNamaFile('Rekap_' + role + '_' + kelas) + '.xlsx');
  showPopup('✅ File Excel berhasil diunduh', true, 1500);
}
async function exportRekapPDF() {
  if (!rekapDataCache.length) { showPopup('Tampilkan data rekap dulu', false, 2000); return; }
  const dari = document.getElementById('rekapDari').value || '-';
  const sampai = document.getElementById('rekapSampai').value || '-';
  const role = document.getElementById('rekapRole').value || 'siswa';
  const kelas = document.getElementById('rekapKelas').value || 'Semua';
  showLoading('Menyiapkan PDF...');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('REKAP ABSENSI ' + role.toUpperCase(), 148, 15, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('SMPN 8 CIPARASI', 148, 21, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Periode: ' + dari + ' s/d ' + sampai + ' | Kelas: ' + kelas, 148, 26, { align: 'center' });
  doc.text('Diekspor: ' + new Date().toLocaleString('id-ID'), 148, 30, { align: 'center' });
  doc.autoTable({
    head: [['No','Nama','TW','TL','IZIN','SAKIT','ALPA','BOLOS','% Hadir']],
    body: rekapDataCache.map((u, i) => [i+1, u.nama, u.TW, u.TL, u.IZIN, u.SAKIT, u.ALPA, u.BOLOS, u.persen + '%']),
    startY: 35, styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 70, halign: 'left' } }
  });
  doc.save(getNamaFile('Rekap_' + role + '_' + kelas) + '.pdf');
  showPopup('✅ PDF berhasil diunduh', true, 1500);
}
async function exportDaftarNilaiExcel() {
  const table = document.querySelector('#daftarNilaiHasil table');
  if (!table) { showPopup('Tampilkan daftar nilai dulu', false, 2000); return; }
  const mapel = document.getElementById('daftarMapel').value || '-';
  const kelas = document.getElementById('daftarKelas').value || '-';
  showLoading('Menyiapkan Excel...');
  const data = tableToArray(table);
  const info = [['DAFTAR NILAI'],['Mata Pelajaran:', mapel],['Kelas:', kelas],['Sekolah:', 'SMPN 8 Ciparasi'],['Diekspor:', new Date().toLocaleString('id-ID')],[]];
  const ws = XLSX.utils.aoa_to_sheet(info.concat(data));
  ws['!cols'] = data[0].map((_, i) => ({ wch: i === 1 ? 30 : 15 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Nilai');
  XLSX.writeFile(wb, getNamaFile('Daftar_Nilai_' + kelas) + '.xlsx');
  showPopup('✅ File Excel berhasil diunduh', true, 1500);
}
async function exportDaftarNilaiPDF() {
  const table = document.querySelector('#daftarNilaiHasil table');
  if (!table) { showPopup('Tampilkan daftar nilai dulu', false, 2000); return; }
  const mapel = document.getElementById('daftarMapel').value || '-';
  const kelas = document.getElementById('daftarKelas').value || '-';
  showLoading('Menyiapkan PDF...');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('DAFTAR NILAI', 148, 15, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('SMPN 8 CIPARASI', 148, 21, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Mapel: ' + mapel + ' | Kelas: ' + kelas, 148, 26, { align: 'center' });
  doc.text('Diekspor: ' + new Date().toLocaleString('id-ID'), 148, 30, { align: 'center' });
  const data = tableToArray(table);
  doc.autoTable({
    head: [data[0]], body: data.slice(1), startY: 35,
    styles: { fontSize: 9, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 60, halign: 'left' } }
  });
  doc.save(getNamaFile('Daftar_Nilai_' + kelas) + '.pdf');
  showPopup('✅ PDF berhasil diunduh', true, 1500);
}

/* ============ CEK SYARAT ============ */
async function cekSyaratSaya() {
  if (!currentUser || currentUser.role !== 'siswa') { showPopup('Login sebagai siswa dulu', false); return; }
  showLoading('Menghitung...');
  const r = await api('cekSyaratKelas', { nisn: currentUser.user.id });
  if (!r.ok) { showPopup(r.msg, false); return; }
  const s = r.stat;
  const ok = r.memenuhi;
  const color = ok ? '#22c55e' : '#ef4444';
  const bgColor = ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)';
  document.getElementById('syaratHasil').innerHTML =
    `<div style="background:${bgColor};border-left:4px solid ${color};padding:10px;border-radius:8px;">
      <div style="font-size:.95rem;font-weight:700;color:${color};margin-bottom:4px;">${ok ? '✅' : '❌'} ${r.pesan}</div>
      <div style="font-size:.8rem;">Kehadiran: <strong style="color:${color}">${s.persen}%</strong> (min 80%)</div>
    </div>
    <div class="small text-muted mt-2" style="font-size:.7rem;">📅 ${r.periode.mulai} s/d ${r.periode.akhir}</div>
    <table class="table table-sm mt-2" style="font-size:.75rem;">
      <tr><td>Hari sekolah</td><td class="text-end"><strong>${s.totalHariSekolah}</strong></td></tr>
      <tr><td>Sesi efektif</td><td class="text-end"><strong>${s.totalSesiEfektif}</strong></td></tr>
      <tr><td>✅ TW</td><td class="text-end"><strong>${s.hadirTW}</strong></td></tr>
      <tr><td>🟡 TL</td><td class="text-end"><strong>${s.hadirTL}</strong></td></tr>
      <tr><td>📝 Izin</td><td class="text-end"><strong>${s.izin}</strong></td></tr>
      <tr><td>🤒 Sakit</td><td class="text-end"><strong>${s.sakit}</strong></td></tr>
      <tr><td>❌ Alpa</td><td class="text-end"><strong class="text-danger">${s.alpa}</strong></td></tr>
      <tr><td>🚫 Bolos</td><td class="text-end"><strong class="text-danger">${s.bolos}</strong></td></tr>
    </table>`;
  closePopup();
}

/* ============ GURU - NILAI ============ */
async function initGuruNilai() {
  if (!currentUser) return;
  let mapelList = [], kelasList = [];
  if (currentUser.role === 'guru') {
    const [rM, rK] = await Promise.all([
      api('getMapelGuru', { nip: currentUser.user.id }, true),
      api('getKelasGuru', { nip: currentUser.user.id }, true)
    ]);
    mapelList = rM.ok ? rM.mapel : [];
    kelasList = rK.ok ? rK.kelas : [];
  } else if (currentUser.role === 'admin') {
    const [rM, rK] = await Promise.all([api('listMapel', {}, true), api('listKelas', {}, true)]);
    mapelList = rM.ok ? rM.mapel : [];
    kelasList = rK.ok ? rK.kelas : [];
  }
  guruMapelList = mapelList;
  guruKelasList = kelasList;
  ['inputMapel','daftarMapel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = mapelList.length ? mapelList.map(m => `<option value="${m}">${m}</option>`).join('') : '<option value="">(Belum ada)</option>';
  });
  ['inputKelas','daftarKelas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = kelasList.length ? kelasList.map(k => `<option value="${k}">${k}</option>`).join('') : '<option value="">(Belum ada)</option>';
  });
  loadSiswaUntukInput();
  loadDaftarNilai();
}
async function loadSiswaUntukInput() {
  const kelas = document.getElementById('inputKelas').value;
  const body = document.getElementById('inputNilaiBody');
  if (!kelas) { body.innerHTML = '<div class="text-muted small">Pilih kelas dulu.</div>'; return; }
  const r = await api('getSiswaByKelas', { kelas }, true);
  if (!r.ok || !r.data.length) { body.innerHTML = '<div class="text-muted small">Tidak ada siswa.</div>'; return; }
  currentSiswaInput = r.data;
  body.innerHTML = '<div class="table-wrap" style="max-height:400px;"><table><thead><tr><th style="width:36px">No</th><th>Nama</th><th style="width:90px">Nilai</th></tr></thead><tbody>' +
    r.data.map((s, i) => `<tr><td>${i+1}</td><td><span style="font-size:.82rem">${s.nama}</span><br><small class="text-muted">${s.nisn}</small></td><td><input type="number" class="form-control form-control-sm nilai-input" data-nisn="${s.nisn}" placeholder="0" min="0" max="100"></td></tr>`).join('') +
    '</tbody></table></div>';
}
async function simpanNilaiMassal() {
  const jenis = document.getElementById('inputJenisNilai').value.trim();
  const mapel = document.getElementById('inputMapel').value;
  const kelas = document.getElementById('inputKelas').value;
  if (!jenis) { showPopup('Isi jenis nilai dulu', false); return; }
  if (!mapel || !kelas) { showPopup('Pilih mapel & kelas', false); return; }
  const data = [];
  document.querySelectorAll('#inputNilaiBody .nilai-input').forEach(inp => {
    const nisn = inp.dataset.nisn;
    const nilai = inp.value.trim();
    if (nilai !== '') {
      const s = currentSiswaInput.find(x => x.nisn === nisn);
      data.push({ nisn, nama: s ? s.nama : '', nilai });
    }
  });
  if (!data.length) { showPopup('Belum ada nilai', false); return; }
  showLoading(`Menyimpan ${data.length} nilai...`);
  const r = await api('simpanNilai', { nip: currentUser.user.id, namaGuru: currentUser.user.nama, mapel, kelas, jenisNilai: jenis, data });
  showPopup(r.msg, r.ok, r.ok ? 1800 : 2500);
  if (r.ok) { document.getElementById('inputJenisNilai').value = ''; apiCache.clear(); loadSiswaUntukInput(); loadDaftarNilai(); }
}
async function loadDaftarNilai() {
  const mapel = document.getElementById('daftarMapel').value;
  const kelas = document.getElementById('daftarKelas').value;
  const el = document.getElementById('daftarNilaiHasil');
  if (!mapel || !kelas) { el.innerHTML = '<div class="text-muted small">Pilih mapel & kelas.</div>'; return; }
  showLoading('Memuat...');
  const r = await api('getDaftarNilai', { mapel, kelas });
  closePopup();
  if (!r.ok) { showPopup(r.msg, false); return; }
  if (!r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada siswa.</div>'; return; }
  if (!r.jenis.length) { el.innerHTML = '<div class="text-muted small">Belum ada nilai.</div>'; return; }
  daftarNilaiCache = r;
  el.innerHTML = '<table><thead><tr><th>No</th><th>Nama</th>' +
    r.jenis.map(j => `<th class="text-center">${j}</th>`).join('') +
    '</tr></thead><tbody>' +
    r.data.map((s, i) => `<tr><td>${i+1}</td><td>${s.nama}<br><small class="text-muted">${s.nisn}</small></td>` +
      r.jenis.map(j => `<td class="text-center">${s.nilai[j] !== undefined ? s.nilai[j] : '-'}</td>`).join('') +
      '</tr>').join('') +
    '</tbody></table>';
}

/* ============ KELULUSAN ============ */
async function cekKelulusan() {
  const nisn = document.getElementById('kelulusanNisn').value.trim();
  if (!nisn) { showPopup('Masukkan NISN', false); return; }
  const el = document.getElementById('kelulusanHasil');
  el.innerHTML = '<div class="text-muted small">Memeriksa...</div>';
  const r = await api('cekSyaratKelas', { nisn });
  if (!r.ok) { el.innerHTML = `<div class="alert alert-danger small">${r.msg}</div>`; return; }
  const s = r.stat;
  const ok = r.memenuhi;
  const color = ok ? '#22c55e' : '#ef4444';
  const bgColor = ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)';
  el.innerHTML = `<div style="background:${bgColor};border-left:4px solid ${color};padding:12px;border-radius:8px;">
      <div style="font-weight:700;">${r.siswa.nama} (${r.siswa.kelas})</div>
      <div style="font-size:1rem;font-weight:700;color:${color};margin-top:6px;">${ok ? '✅' : '❌'} ${r.pesan}</div>
      <div style="font-size:.85rem;">Persentase: <strong>${s.persen}%</strong></div>
    </div>
    <table class="table table-sm mt-2" style="font-size:.78rem;">
      <tr><td>Hari sekolah</td><td class="text-end">${s.totalHariSekolah}</td></tr>
      <tr><td>Total sesi</td><td class="text-end">${s.totalSesiEfektif}</td></tr>
      <tr><td>TW / TL</td><td class="text-end">${s.hadirTW} / ${s.hadirTL}</td></tr>
      <tr><td>Izin / Sakit</td><td class="text-end">${s.izin} / ${s.sakit}</td></tr>
      <tr><td>Alpa / Bolos</td><td class="text-end text-danger"><strong>${s.alpa} / ${s.bolos}</strong></td></tr>
    </table>`;
}

/* ============ ADMIN ============ */
function toggleAccordion(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const header = el.previousElementSibling;
  const isOpen = el.classList.contains('open');
  el.classList.toggle('open', !isOpen);
  header?.classList.toggle('open', !isOpen);
  if (!isOpen) {
    const loaders = { 'acc-sesi': renderSesiList, 'acc-libur': adminLoadLibur, 'acc-izinfp': adminLoadIzinFp, 'acc-user': () => { adminLoadUsers(); adminLoadFp(); }, 'acc-fitur': adminLoadFitur, 'acc-historis': muatHistoris };
    loaders[id]?.();
  }
}
function adminLoadAll() {
  renderSesiList(); adminLoadLibur(); adminLoadIzinFp(); adminLoadUsers(); adminLoadFp(); adminLoadFitur(); muatHistoris();
}
async function renderSesiList() {
  const el = document.getElementById('sesiList');
  if (!el) return;
  if (!currentSesiList.length) { el.innerHTML = '<div class="text-muted small">Belum ada sesi.</div>'; return; }
  el.innerHTML = currentSesiList.map(s =>
    `<div class="d-flex justify-content-between align-items-center border-bottom py-1">
      <div><strong style="font-size:.85rem">${s.sesi}</strong><br><small class="text-muted">TW ${s.mulaiTW}-${s.batasTW} | TL ${s.batasTW}-${s.batasTL}</small></div>
      <button class="btn btn-danger btn-sm py-0 px-2" onclick="adminHapusSesi('${s.sesi}')"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}
async function adminTambahSesi() {
  const nama = document.getElementById('newSesiNama').value.trim();
  const mulaiTW = document.getElementById('newSesiMulaiTW').value;
  const batasTW = document.getElementById('newSesiBatasTW').value;
  const batasTL = document.getElementById('newSesiBatasTL').value;
  if (!nama || !mulaiTW || !batasTW || !batasTL) { showPopup('Semua field wajib diisi', false); return; }
  showLoading('Menyimpan sesi...');
  const r = await api('tambahSesi', { sesi: nama, mulaiTW, batasTW, batasTL, tutup: batasTL });
  if (r.ok) { document.getElementById('newSesiNama').value = ''; apiCache.clear(); await muatSesi(); renderSesiList(); }
  showPopup(r.msg, r.ok);
}
async function adminHapusSesi(sesi) {
  if (!confirm('Hapus ' + sesi + '?')) return;
  showLoading('Menghapus...');
  const r = await api('hapusSesi', { sesi });
  if (r.ok) { apiCache.clear(); await muatSesi(); renderSesiList(); }
  showPopup(r.msg, r.ok);
}
async function adminSimpanLibur() {
  const tanggal = document.getElementById('liburTanggal').value;
  const keterangan = document.getElementById('liburKet').value.trim();
  if (!tanggal || !keterangan) { showPopup('Tanggal & keterangan wajib', false); return; }
  showLoading('Menyimpan...');
  const r = await api('simpanLibur', { tanggal, keterangan });
  if (r.ok) { document.getElementById('liburKet').value = ''; apiCache.clear(); adminLoadLibur(); refreshStatusHariIni(); }
  showPopup(r.msg, r.ok);
}
async function adminLoadLibur() {
  const r = await api('listLibur', {}, true);
  const el = document.getElementById('liburList');
  if (!el) return;
  if (!r.ok || !r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada hari libur.</div>'; return; }
  el.innerHTML = r.data.map(l =>
    `<div class="d-flex justify-content-between align-items-center border-bottom py-1">
      <div><small>${l.tanggal} — ${l.keterangan}</small></div>
      <button class="btn btn-danger btn-sm py-0 px-2" onclick="adminHapusLibur('${l.tanggal}')"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}
async function adminHapusLibur(tanggal) {
  if (!confirm('Hapus libur ' + tanggal + '?')) return;
  showLoading('Menghapus...');
  const r = await api('hapusLibur', { tanggal });
  if (r.ok) { apiCache.clear(); adminLoadLibur(); refreshStatusHariIni(); }
  showPopup(r.msg, r.ok);
}
async function adminLoadIzinFp() {
  showLoading('Memuat...');
  const r = await api('listIzinFpAll');
  closePopup();
  if (!r.ok) { showPopup(r.msg, false); return; }
  izinFpData = r.data || [];
  renderIzinFpList();
}
function renderIzinFpList() {
  const el = document.getElementById('izinFpList');
  if (!el) return;
  const filterRole = document.getElementById('izinFpFilterRole').value;
  const filterStatus = document.getElementById('izinFpFilterStatus').value;
  const search = (document.getElementById('izinFpSearch').value || '').toLowerCase().trim();
  let list = izinFpData.slice();
  if (filterRole !== 'all') list = list.filter(u => u.role === filterRole);
  if (filterStatus === 'allowed') list = list.filter(u => u.allowed);
  if (filterStatus === 'denied') list = list.filter(u => !u.allowed);
  if (search) list = list.filter(u => String(u.nama).toLowerCase().includes(search) || String(u.id).toLowerCase().includes(search));
  document.getElementById('izinFpCount').textContent = list.length;
  document.getElementById('izinFpCountOn').textContent = izinFpData.filter(u => u.allowed).length;
  if (!list.length) { el.innerHTML = '<div class="text-muted small p-3 text-center">Tidak ada user.</div>'; return; }
  el.innerHTML = list.map(u => {
    const alasan = u.allowed && u.alasan ? `<div class="small text-success">📌 ${u.alasan}</div>` : '';
    return `<div class="switch-row">
      <div style="flex:1;min-width:0;">
        <div class="label" style="font-size:.85rem">${u.nama}</div>
        <div class="desc" style="font-size:.7rem">${u.id} • ${u.role} ${u.extra || ''}</div>
        ${alasan}
      </div>
      <label class="switch"><input type="checkbox" ${u.allowed ? 'checked' : ''} onchange="adminToggleIzinFp('${u.id}', this.checked)"><span class="slider"></span></label>
    </div>`;
  }).join('');
}
async function adminToggleIzinFp(id, allowed) {
  const user = izinFpData.find(u => u.id === id);
  if (!user) return;
  let alasan = 'Izin khusus';
  if (allowed) {
    const input = prompt('Beri izin untuk ' + user.nama + '.\nAlasan:', 'Kegiatan khusus');
    if (input === null) { renderIzinFpList(); return; }
    alasan = input.trim() || 'Izin khusus';
  }
  user.allowed = allowed; user.alasan = allowed ? alasan : '';
  renderIzinFpList();
  const r = allowed
    ? await api('setIzinFp', { id, nama: user.nama, role: user.role, alasan })
    : await api('hapusIzinFp', { id });
  if (!r.ok) { user.allowed = !allowed; user.alasan = ''; renderIzinFpList(); showPopup(r.msg, false, 1800); return; }
  showPopup(r.msg, true, 1000);
}
async function adminBulkIzinFp(allowed) {
  const filterRole = document.getElementById('izinFpFilterRole').value;
  const filterStatus = document.getElementById('izinFpFilterStatus').value;
  const search = (document.getElementById('izinFpSearch').value || '').toLowerCase().trim();
  let list = izinFpData.slice();
  if (filterRole !== 'all') list = list.filter(u => u.role === filterRole);
  if (filterStatus === 'allowed') list = list.filter(u => u.allowed);
  if (filterStatus === 'denied') list = list.filter(u => !u.allowed);
  if (search) list = list.filter(u => String(u.nama).toLowerCase().includes(search) || String(u.id).toLowerCase().includes(search));
  const target = allowed ? list.filter(u => !u.allowed) : list.filter(u => u.allowed);
  if (!target.length) { showPopup('Tidak ada user yang perlu diubah', false, 1500); return; }
  if (!confirm((allowed ? 'IZINKAN' : 'TOLAK') + ' sidik jari untuk ' + target.length + ' user?')) return;
  let alasan = 'Izin massal';
  if (allowed) {
    const input = prompt('Alasan izin massal:', 'PJJ / Kegiatan khusus');
    if (input === null) return;
    alasan = input.trim() || 'Izin massal';
  }
  showLoading('Memproses ' + target.length + ' user...');
  const r = await api('setIzinFpBulk', { ids: target.map(u => u.id), allowed, alasan });
  if (r.ok) await adminLoadIzinFp();
  else showPopup(r.msg, false);
}
async function adminLoadUsers() {
  const r = await api('listUsers', {}, true);
  const el = document.getElementById('userList');
  if (!el) return;
  if (!r.ok || !r.data.length) { el.innerHTML = '<div class="text-muted small">Tidak ada user.</div>'; return; }
  el.innerHTML = r.data.map(u =>
    `<div class="d-flex justify-content-between align-items-center border-bottom py-1">
      <div><strong style="font-size:.85rem">${u.nama}</strong><br><small class="text-muted">${u.id} • ${u.role}</small></div>
      <button class="btn btn-secondary btn-sm py-0 px-2" onclick="adminResetPin('${u.id}','${u.nama}')"><i class="bi bi-key"></i></button>
    </div>`).join('');
}
async function adminResetPin(id, nama) {
  const newPin = prompt('PIN baru untuk ' + nama + ' (4 digit):');
  if (!newPin) return;
  if (!/^\d{4}$/.test(newPin)) { showPopup('PIN harus 4 digit', false); return; }
  showLoading('Menyimpan...');
  const r = await api('resetPin', { id, newPin });
  showPopup(r.msg, r.ok);
}
async function adminLoadFp() {
  const r = await api('listFingerprint', {}, true);
  const el = document.getElementById('fpList');
  if (!el) return;
  if (!r.ok || !r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada sidik jari.</div>'; return; }
  el.innerHTML = r.data.map(f =>
    `<div class="d-flex justify-content-between align-items-center border-bottom py-1">
      <div><strong style="font-size:.85rem">${f.nama}</strong><br><small class="text-muted">${f.id} • ${f.role}</small></div>
      <button class="btn btn-danger btn-sm py-0 px-2" onclick="adminResetFp('${f.id}','${f.nama}')"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}
async function adminResetFp(id, nama) {
  if (!confirm('Reset sidik jari ' + nama + '?')) return;
  showLoading('Mereset...');
  const r = await api('resetFingerprint', { id });
  if (r.ok) { apiCache.clear(); adminLoadFp(); }
  showPopup(r.msg, r.ok);
}
async function adminLoadFitur() {
  const r = await api('getFitur', {}, true);
  if (!r.ok) return;
  fiturGlobal = r.fitur;
  const e1 = document.getElementById('fitIzinSiswa');
  const e2 = document.getElementById('fitIzinGuru');
  const e3 = document.getElementById('fitTglMulai');
  const e4 = document.getElementById('fitTglAkhir');
  if (e1) e1.checked = fiturGlobal.izinIzinSakitSiswa === 'YA';
  if (e2) e2.checked = fiturGlobal.izinIzinSakitGuru === 'YA';
  if (e3) e3.value = fiturGlobal.tanggalMulaiHitung || '';
  if (e4) e4.value = fiturGlobal.tanggalAkhirHitung || '';
}
async function adminSetFitur() {
  const updates = {
    izinIzinSakitSiswa: document.getElementById('fitIzinSiswa').checked ? 'YA' : 'TIDAK',
    izinIzinSakitGuru: document.getElementById('fitIzinGuru').checked ? 'YA' : 'TIDAK',
    tanggalMulaiHitung: document.getElementById('fitTglMulai').value || '',
    tanggalAkhirHitung: document.getElementById('fitTglAkhir').value || ''
  };
  showLoading('Menyimpan...');
  const r = await api('setFitur', { fitur: updates });
  if (r.ok) { apiCache.clear(); Object.assign(fiturGlobal, updates); }
  showPopup(r.msg, r.ok);
}
async function muatHistoris() {
  const el = document.getElementById('historisHasil');
  if (!el) return;
  el.innerHTML = '<div class="text-muted small">Memuat...</div>';
  const r = await api('historis');
  if (!r.ok) { el.innerHTML = `<div class="alert alert-danger small">${r.msg}</div>`; return; }
  if (!r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada aktivitas.</div>'; return; }
  el.innerHTML = '<table><thead><tr><th>Waktu</th><th>Aksi</th><th>Oleh</th><th>Detail</th></tr></thead><tbody>' +
    r.data.slice(0, 50).map(h =>
      `<tr><td><small>${h.timestamp}</small></td><td><span class="badge badge-role-admin">${h.aksi}</span></td><td><small>${h.oleh}</small></td><td><small>${h.detail}</small></td></tr>`
    ).join('') + '</tbody></table>';
}
async function adminArsipManual() {
  if (!confirm('Arsip data kehadiran lama ke sheet Historis?\nData hari ini tetap di sheet Kehadiran.')) return;
  showLoading('Mengarsipkan...');
  const r = await api('arsipManual');
  showPopup(r.msg, r.ok, 3000);
  if (r.ok) { apiCache.clear(); muatHistoris(); muatRekapRealtime(); }
}
async function adminPasangTrigger() {
  if (!confirm('Pasang trigger arsip otomatis harian jam 23:00?')) return;
  showLoading('Memasang trigger...');
  const r = await api('pasangTrigger');
  showPopup(r.msg, r.ok, 3000);
  if (r.ok) {
    const info = document.getElementById('infoArsip');
    if (info) info.innerHTML = '✅ Trigger: <strong>aktif</strong> — arsip otomatis setiap hari jam 23:00.';
  }
}

/* ============ GLOBAL EVENTS ============ */
document.addEventListener('keypress', (e) => {
  if (e.target.id === 'loginInput' && e.key === 'Enter') doLogin();
  if (e.target.id === 'qrManualBarcode' && e.key === 'Enter') qrSubmitManual();
});
document.addEventListener('input', (e) => {
  if (['loginInput','qrManualBarcode','izinId'].includes(e.target.id)) {
    e.target.value = e.target.value.replace(/\D/g, '');
  }
});
document.getElementById('loginModalOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'loginModalOverlay') closeLoginPopup();
});
