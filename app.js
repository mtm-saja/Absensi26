/*******************************************************
 * ABSENSI ONLINE - FRONTEND LOGIC
 * v10.0 - Perbaikan Layout & Fitur Historis
 *******************************************************/

const API_URL = 'https://script.google.com/macros/s/AKfycbwYSdrSiOqFCyocCzYdKGvLcKjgykSOOTVYCdNoZilXKXIZ35bgUPsuFCB48SzEgnkb/exec';
const LS_KEY = 'absensi_session_v10';

/*******************************************************
 * SIDEBAR TOGGLE
 *******************************************************/
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const main = document.getElementById('mainContent');
  if (!sidebar) return;

  if (window.innerWidth <= 992) {
    // Mobile: slide in/out
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
  } else {
    // Desktop: collapse/expand
    sidebar.classList.toggle('closed');
    if (main) main.classList.toggle('full');
  }
}

function toggleUserMenu() {
  const d = document.getElementById('userDropdown');
  if (d) d.classList.toggle('open');
}
function closeUserMenu() {
  const d = document.getElementById('userDropdown');
  if (d) d.classList.remove('open');
}

// Tutup user menu jika klik di luar
document.addEventListener('click', (e) => {
  const ud = document.getElementById('userDropdown');
  const btn = e.target.closest('.user-btn');
  if (ud && !btn && !e.target.closest('#userDropdown')) ud.classList.remove('open');
});
/*******************************************************
 * STATE
 *******************************************************/
let currentUser = null;
let currentSesiList = [];
let currentSesiAktif = null;
let statusHariIni = { isLibur: false, isSesiAktif: false, pesan: '' };
let fiturGlobal = { izinIzinSakitGuru:'YA', izinIzinSakitSiswa:'YA', tanggalMulaiHitung:'', tanggalAkhirHitung:'' };
let qrScanner = null;
let qrScanning = false;
let lastScan = { code:'', time:0 };
let sesiTimer = null;
let rekapTimer = null;
let riwayatTimer = null;
let datetimeTimer = null;
let izinFpData = [];
let guruMapelList = [];
let guruKelasList = [];
let currentSiswaInput = [];

/*******************************************************
 * POPUP SYSTEM
 *******************************************************/
function showLoading(text) {
  text = text || 'Memproses...';
  const ov = document.getElementById('popupOverlay');
  const box = document.getElementById('popupBox');
  const icon = document.getElementById('popupIcon');
  const content = document.getElementById('popupContent');
  const btn = document.getElementById('popupClose');
  box.className = 'popup-box';
  icon.innerHTML = '<div class="spinner"></div>';
  content.innerHTML = '<div class="text">' + text + '</div>';
  btn.classList.add('hidden');
  ov.classList.remove('hidden');
}
function showPopup(text, ok, autoCloseMs) {
  if (ok === undefined) ok = true;
  if (autoCloseMs === undefined) autoCloseMs = 1500;
  const ov = document.getElementById('popupOverlay');
  const box = document.getElementById('popupBox');
  const icon = document.getElementById('popupIcon');
  const content = document.getElementById('popupContent');
  const btn = document.getElementById('popupClose');
  box.className = 'popup-box ' + (ok ? 'ok' : 'err');
  icon.textContent = ok ? '✅' : '❌';
  content.innerHTML = '<div class="text">' + text + '</div>';
  btn.classList.remove('hidden');
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

/*******************************************************
 * LOGIN POPUP
 *******************************************************/
function showLoginPopup(hint) {
  if (currentUser) { showPopup('Anda sudah login sebagai ' + currentUser.user.nama, false, 2000); return; }
  const modal = document.getElementById('loginModalOverlay');
  const sub = document.getElementById('loginModalSubtitle');
  sub.textContent = hint === 'siswa' ? 'Masukkan NISN Siswa (8-10 digit)' : 'Masukkan NISN Siswa atau PIN Guru/Admin';
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('loginInput').focus(), 200);
}
function closeLoginPopup() {
  document.getElementById('loginModalOverlay').classList.add('hidden');
  document.getElementById('loginInput').value = '';
}

/*******************************************************
 * API
 *******************************************************/
async function api(action, payload) {
  payload = payload || {};
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action: action }, payload)),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  });
  return res.json();
}

/*******************************************************
 * SESSION
 *******************************************************/
function saveSession() {
  if (!currentUser) return localStorage.removeItem(LS_KEY);
  localStorage.setItem(LS_KEY, JSON.stringify({
    role: currentUser.role, user: currentUser.user,
    hasFingerprint: currentUser.hasFingerprint,
    allowFingerprint: currentUser.allowFingerprint,
    allowIzinSakit: currentUser.allowIzinSakit, ts: Date.now()
  }));
}
function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - s.ts > 12*60*60*1000) { localStorage.removeItem(LS_KEY); return null; }
    return s;
  } catch(e) { return null; }
}

/*******************************************************
 * INIT
 *******************************************************/
window.addEventListener('DOMContentLoaded', async () => {
  startClock();
  await muatFitur();
  await muatSesi();
  await refreshStatusHariIni();
  const s = loadSession();
  if (s) { currentUser = s; applyUserToUI(); }
  showPage('dashboard');
  startSesiWatcher();
  startRekapWatcher();
  startRiwayatWatcher();
  isiDropdownKelasCari();
});

/*******************************************************
 * CLOCK (topbar)
 *******************************************************/
function startClock() {
  const update = () => {
    const el = document.getElementById('topbarDateTime');
    if (!el) return;
    const now = new Date();
    const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][now.getDay()];
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][now.getMonth()];
    const tanggal = now.getDate();
    const tahun = now.getFullYear();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const ss = String(now.getSeconds()).padStart(2,'0');
    el.textContent = hari + ', ' + tanggal + ' ' + bulan + ' ' + tahun + ' || ' + hh + ':' + mm + ':' + ss;
  };
  update();
  if (datetimeTimer) clearInterval(datetimeTimer);
  datetimeTimer = setInterval(update, 1000);
}

function applyUserToUI() {
  const role = currentUser ? currentUser.role : null;
  const nama = currentUser ? currentUser.user.nama : 'Belum Login';

  // Topbar username (di dropdown)
  document.getElementById('topbarUserName').textContent = nama;

  // Subtitle: kalau login → nama user saja; kalau belum → "Dashboard"
  const subtitle = document.getElementById('topbarSubtitle');
  if (subtitle) {
    subtitle.textContent = currentUser ? nama : 'Dashboard';
  }

  // ===== Rest of function tetap sama =====
  const menus = ['menuFpSiswa','menuSyarat','menuQR','menuFpGuru','menuIzin','menuRekap','menuInputNilai','menuDaftarNilai','menuPengaturan'];
  menus.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('disabled'); });

  if (role === 'siswa') {
    document.getElementById('menuFpSiswa').classList.remove('disabled');
    document.getElementById('menuSyarat').classList.remove('disabled');
    document.getElementById('menuLoginSiswa').style.display = 'none';
    document.getElementById('menuLoginGuru').style.display = 'none';
  } else if (role === 'guru') {
    document.getElementById('menuQR').classList.remove('disabled');
    document.getElementById('menuFpGuru').classList.remove('disabled');
    document.getElementById('menuIzin').classList.remove('disabled');
    document.getElementById('menuRekap').classList.remove('disabled');
    document.getElementById('menuInputNilai').classList.remove('disabled');
    document.getElementById('menuDaftarNilai').classList.remove('disabled');
    document.getElementById('menuLoginSiswa').style.display = 'none';
    document.getElementById('menuLoginGuru').style.display = 'none';
    const optG = document.getElementById('izinRoleGuruOpt'); if (optG) optG.disabled = true;
    const optRG = document.getElementById('rekapRoleGuruOpt'); if (optRG) optRG.disabled = true;
  } else if (role === 'admin') {
    document.getElementById('menuQR').classList.remove('disabled');
    document.getElementById('menuIzin').classList.remove('disabled');
    document.getElementById('menuRekap').classList.remove('disabled');
    document.getElementById('menuInputNilai').classList.remove('disabled');
    document.getElementById('menuDaftarNilai').classList.remove('disabled');
    document.getElementById('menuPengaturan').classList.remove('disabled');
    document.getElementById('menuLoginSiswa').style.display = 'none';
    document.getElementById('menuLoginGuru').style.display = 'none';
    const optG = document.getElementById('izinRoleGuruOpt'); if (optG) optG.disabled = false;
    const optRG = document.getElementById('rekapRoleGuruOpt'); if (optRG) optRG.disabled = false;
  } else {
    document.getElementById('menuLoginSiswa').style.display = '';
    document.getElementById('menuLoginGuru').style.display = '';
  }
  const adminBox = document.getElementById('adminScanTargetBox');
  if (adminBox) adminBox.classList.toggle('hidden', role !== 'admin');

  if (role === 'siswa') updateFingerprintButton('siswa');
  if (role === 'guru') updateFingerprintButton('guru');
}

/*******************************************************
 * PAGE ROUTER
 *******************************************************/
const PAGE_TITLES = {
  dashboard:'Dashboard', cariSiswa:'Cari Data Siswa',
  sidikJariSiswa:'Absensi Sidik Jari (Siswa)', syarat:'Cek Syarat Naik Kelas / Lulus',
  qr:'QR Barcode Scanner', sidikJariGuru:'Absensi Sidik Jari (Guru)',
  izin:'Input Izin / Sakit', rekap:'Rekap Absensi',
  inputNilai:'Input Nilai', daftarNilai:'Daftar Nilai',
  kelulusan:'Cek Kelulusan', pengaturan:'Pengaturan Sistem'
};

function showPage(pageId, el) {
  if (!canAccessPage(pageId)) return;

  // Hide semua page
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.remove('hidden');

  // Update judul & breadcrumb
  document.getElementById('pageTitle').textContent = PAGE_TITLES[pageId] || pageId;
  document.getElementById('pageBreadcrumb').textContent = PAGE_TITLES[pageId] || pageId;

  // ==== FIX: Hapus active dari SEMUA menu, lalu tambah ke menu yang diklik ====
  document.querySelectorAll('.sidebar-menu .nav-link').forEach(a => a.classList.remove('active'));
  if (el && el.classList) {
    el.classList.add('active');
  } else {
    // Fallback: cari berdasarkan onclick
    const found = Array.from(document.querySelectorAll('.sidebar-menu .nav-link'))
      .find(a => (a.getAttribute('onclick') || '').indexOf("'" + pageId + "'") >= 0);
    if (found) found.classList.add('active');
  }

  // ==== FIX: Auto-close sidebar SETELAH menu diklik (mobile) ====
  if (window.innerWidth <= 992) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    }
  }

  // Page-specific init
  if (pageId === 'dashboard') { muatRiwayat(); muatRekapRealtime(); refreshSesiAktif(); refreshStatusHariIni(); }
  if (pageId === 'cariSiswa') { isiDropdownKelasCari(); }
  if (pageId === 'sidikJariSiswa' || pageId === 'sidikJariGuru' || pageId === 'qr') { renderSesiBannerEls(); }
  if (pageId === 'izin') { muatSesi(); }
  if (pageId === 'inputNilai' || pageId === 'daftarNilai') { if (currentUser) initGuruNilai(); }
  if (pageId === 'pengaturan') { adminLoadAll(); }
}  if (window.innerWidth <= 992) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
      }
    }

function canAccessPage(pageId) {
  const role = currentUser ? currentUser.role : null;
  const prot = {
    sidikJariSiswa:['siswa'], syarat:['siswa'], qr:['guru','admin'],
    sidikJariGuru:['guru'], izin:['guru','admin'], rekap:['guru','admin'],
    inputNilai:['guru','admin'], daftarNilai:['guru','admin'], pengaturan:['admin']
  };
  if (prot[pageId]) {
    if (!role || prot[pageId].indexOf(role) < 0) {
      showPopup('Silakan login dulu dengan akun yang sesuai', false, 2000);
      if (!role) showLoginPopup();
      return false;
    }
  }
  return true;
}

function guardMenu(role, target, el) {
  if (!currentUser) { showLoginPopup(role); return; }
  if (currentUser.role !== role && !(role === 'guru' && currentUser.role === 'admin')) {
    showPopup('Anda login sebagai ' + currentUser.role + ', tidak bisa akses menu ini', false, 2000);
    return;
  }
  const map = {
    sidikJariSiswa:'sidikJariSiswa', syarat:'syarat', qr:'qr',
    sidikJariGuru:'sidikJariGuru', izin:'izin', rekap:'rekap',
    inputNilai:'inputNilai', daftarNilai:'daftarNilai', pengaturan:'pengaturan'
  };
  if (map[target]) showPage(map[target], el);
}

/*******************************************************
 * LOGIN / LOGOUT
 *******************************************************/
async function doLogin() {
  const val = document.getElementById('loginInput').value.trim();
  if (!val) { showPopup('Input wajib diisi', false); return; }
  if (!/^\d{4}$/.test(val) && !/^\d{8,10}$/.test(val)) {
    showPopup('Format salah. NISN 8–10 digit / PIN 4 digit.', false); return;
  }
  showLoading('Memverifikasi login...');
  try {
    const payload = /^\d{4}$/.test(val) ? { id:'', pin:val } : { id:val, pin:'' };
    const r = await api('login', payload);
    if (!r.ok) { showPopup(r.msg, false, 2000); return; }
    currentUser = r;
    saveSession();
    closeLoginPopup();
    applyUserToUI();
    await muatFitur();
    showPopup('Login Berhasil! Halo ' + r.user.nama, true, 1500);
    if (r.role === 'siswa') showPage('sidikJariSiswa');
    else if (r.role === 'guru') showPage('qr');
    else if (r.role === 'admin') showPage('pengaturan');
  } catch(e) { showPopup('Gagal koneksi: '+e.message, false, 2500); }
}

function doLogout() {
  qrTutupKamera();
  if (sesiTimer) clearInterval(sesiTimer);
  if (rekapTimer) clearInterval(rekapTimer);
  if (riwayatTimer) clearInterval(riwayatTimer);
  currentUser = null;
  localStorage.removeItem(LS_KEY);
  applyUserToUI();
  showPopup('Logout berhasil', true, 1500);
  showPage('dashboard');
  startSesiWatcher();
  startRekapWatcher();
  startRiwayatWatcher();
}

/*******************************************************
 * FITUR
 *******************************************************/
async function muatFitur() {
  try { const r = await api('getFitur'); if (r.ok) fiturGlobal = r.fitur; } catch(e) {}
}

/*******************************************************
 * SESI
 *******************************************************/
async function muatSesi() {
  try {
    const r = await api('getSesi');
    if (!r.ok) return;
    currentSesiList = r.sesi;
    const opts = r.sesi.map(s =>
      '<option value="' + s.sesi + '">' + s.sesi + ' (TW ' + s.mulaiTW + '-' + s.batasTW + ' | TL ' + s.batasTW + '-' + s.batasTL + ')</option>'
    ).join('');
    const el = document.getElementById('izinSesiSelect');
    if (el) el.innerHTML = opts || '<option value="">(Belum ada sesi)</option>';
  } catch(e) {}
}

async function refreshSesiAktif() {
  try {
    const r = await api('getSesiAktif');
    currentSesiAktif = r.ok ? r : null;
    renderSesiBannerEls();
  } catch(e) {}
}

async function refreshStatusHariIni() {
  try {
    const r = await api('getStatusHariIni');
    if (r.ok) statusHariIni = r;
    renderSesiBannerEls();
    handleRiwayatVisibility();
  } catch(e) {}
}

function renderSesiBannerEls() {
  const ids = ['sesiBannerContainer','siswaSesiBanner','guruSesiBanner','guruFpSesiBanner'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Prioritas: hari libur > sesi aktif > tidak ada sesi
    if (statusHariIni && statusHariIni.isLibur) {
      el.innerHTML = '<div class="sesi-banner err">' +
        '<div class="label">Status Hari Ini</div>' +
        '<div class="name">🏖️ ' + (statusHariIni.keteranganLibur || 'Hari Libur') + '</div>' +
        '<div class="time">Selamat beristirahat — tidak ada absensi hari ini</div></div>';
      return;
    }
    if (!currentSesiAktif) {
      el.innerHTML = '<div class="sesi-banner warn">' +
        '<div class="label">Status Sesi</div>' +
        '<div class="name">Tidak Ada Sesi</div>' +
        '<div class="time">Saat ini tidak ada sesi berlangsung</div></div>';
      return;
    }
    const s = currentSesiAktif.info;
    const st = currentSesiAktif.status;
    let cls = 'sesi-banner', tagText = '';
    if (st === 'TW') tagText = '🟢 Tepat Waktu';
    else if (st === 'TL') { cls += ' warn'; tagText = '🟡 Terlambat'; }
    else { cls += ' err'; tagText = '🔴 Ditutup'; }
    el.innerHTML = '<div class="' + cls + '">' +
      '<div class="label">Sesi Berlangsung</div>' +
      '<div class="name">' + s.sesi + '</div>' +
      '<div class="time">TW ' + s.mulaiTW + '-' + s.batasTW + ' | TL ' + s.batasTW + '-' + s.batasTL + '</div>' +
      '<div class="status-tag">' + tagText + '</div></div>';
  });
}

function startSesiWatcher() {
  if (sesiTimer) clearInterval(sesiTimer);
  refreshSesiAktif();
  refreshStatusHariIni();
  sesiTimer = setInterval(() => { refreshSesiAktif(); refreshStatusHariIni(); }, 30000);
}
function startRekapWatcher() {
  if (rekapTimer) clearInterval(rekapTimer);
  muatRekapRealtime();
  rekapTimer = setInterval(muatRekapRealtime, 30000);
}
function startRiwayatWatcher() {
  if (riwayatTimer) clearInterval(riwayatTimer);
  handleRiwayatVisibility();
  riwayatTimer = setInterval(handleRiwayatVisibility, 60000);
}

/**
 * Auto-hide riwayat di jam 23:59 - buka saat sesi pertama mulai
 */
function handleRiwayatVisibility() {
  const card = document.getElementById('riwayatCard');
  const wrap = document.getElementById('riwayatTableWrap');
  const closed = document.getElementById('riwayatClosedMsg');
  if (!card) return;

  // Sembunyikan jika:
  // 1. Hari libur, atau
  // 2. Belum ada sesi aktif DAN jam < sesi pertama mulai (mis. sebelum 06:30)
  // 3. Setelah 23:59 (reset harian)

  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  // Cek sesi pertama
  const sesiPertama = currentSesiList && currentSesiList[0];
  const belumMulai = sesiPertama && hhmm < sesiPertama.mulaiTW;

  const isLibur = statusHariIni && statusHariIni.isLibur;
  const noSesi = !currentSesiAktif;

  if (isLibur || (noSesi && belumMulai)) {
    wrap.classList.add('hidden');
    closed.classList.remove('hidden');
    if (isLibur) {
      closed.innerHTML = '<i class="bi bi-sun fs-4 d-block mb-1"></i><strong>Hari Libur</strong><br>Tidak ada absensi hari ini.';
    } else {
      closed.innerHTML = '<i class="bi bi-moon-stars fs-4 d-block mb-1"></i><strong>Sesi Belum Dimulai</strong><br>Belum ada riwayat saat ini.';
    }
  } else {
    wrap.classList.remove('hidden');
    closed.classList.add('hidden');
  }
}

/*******************************************************
 * REKAP REALTIME
 *******************************************************/
async function muatRekapRealtime() {
  try {
    const r = await api('rekapRealtime');
    if (!r.ok) return;
    const html = renderRekapHTML(r.sesi);
    const el = document.getElementById('rekapRealtimeContainer');
    if (el) el.innerHTML = html;
  } catch(e) {}
}
function renderRekapHTML(sesiData) {
  if (!sesiData || !sesiData.length) return '<div class="text-muted small">Belum ada sesi.</div>';
  let html = '<div class="rekap-card"><div class="rekap-title">📊 REKAP HARI INI</div>';
  sesiData.forEach(s => {
    html += '<div style="margin-bottom:10px;">';
    html += '<div class="rekap-sesi-title">' + s.sesi + '</div>';
    html += '<table class="rekap-table"><thead><tr><th>Peran</th><th>TW</th><th>TL</th><th>S</th><th>I</th><th>A</th><th>B</th><th>%</th></tr></thead><tbody>';
    const renderRow = (label, stat) => {
      const p = stat.persen;
      const cls = p >= 80 ? 'ok' : (p >= 60 ? 'warn' : 'bad');
      return '<tr><td>' + label + '</td>' +
        '<td>' + (stat.TW || '-') + '</td><td>' + (stat.TL || '-') + '</td>' +
        '<td>' + (stat.S || '-') + '</td><td>' + (stat.I || '-') + '</td>' +
        '<td>' + (stat.A || '-') + '</td><td>' + (stat.B || '-') + '</td>' +
        '<td class="persen ' + cls + '">' + p + '%</td></tr>';
    };
    html += renderRow('Guru', s.guru);
    html += renderRow('Siswa', s.siswa);
    html += '</tbody></table></div>';
  });
  html += '</div>';
  return html;
}

/*******************************************************
 * RIWAYAT GLOBAL (dashboard)
 *******************************************************/
async function muatRiwayat() {
  try {
    const r = await api('riwayatGlobal');
    if (!r.ok) return;
    const sesiList = r.sesi;
    const data = r.data;
    let head = '<tr><th>No</th><th>Nama</th><th>Role</th>';
    sesiList.forEach(s => { head += '<th>' + s + '</th>'; });
    head += '</tr>';
    document.getElementById('riwayatTableHead').innerHTML = head;
    const tbody = document.getElementById('riwayatTableBody');
    tbody.innerHTML = '';
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="' + (3+sesiList.length) + '" class="text-center text-muted p-3">Belum ada data</td></tr>';
      return;
    }
    const sorted = data.slice().sort((a,b) => a.role === b.role ? 0 : (a.role === 'siswa' ? -1 : 1));
    sorted.forEach((u, i) => {
      const tr = document.createElement('tr');
      let row = '<td>' + (i+1) + '</td><td>' + u.nama + '</td><td><span class="badge badge-role-' + u.role + '">' + u.role + '</span></td>';
      sesiList.forEach(s => {
        const info = u.sesi[s] || { status: '-', jam: '' };
        let st = info.status, label = st;
        if (st === 'ALPA') label = 'A';
        else if (st === 'BOLOS') label = 'B';
        else if (st === 'BELUM' || st === '-') label = '—';
        const cls = (st === 'BELUM' || st === '-') ? 'badge-BELUM' : 'badge-' + st;
        const jam = info.jam ? '<br><small class="text-muted">' + info.jam + '</small>' : '';
        row += '<td><span class="badge ' + cls + '">' + label + '</span>' + jam + '</td>';
      });
      tr.innerHTML = row;
      tbody.appendChild(tr);
    });
  } catch(e) {}
}

/*******************************************************
 * CARI SISWA (per periode)
 *******************************************************/
async function isiDropdownKelasCari() {
  try {
    const r = await api('listKelas');
    if (!r.ok) return;
    const el = document.getElementById('cariSiswaKelas');
    if (!el) return;
    let opts = '<option value="">Semua Kelas</option>';
    r.kelas.forEach(k => { opts += '<option value="' + k + '">' + k + '</option>'; });
    el.innerHTML = opts;
  } catch(e) {}
}

async function doCariSiswa() {
  const q = document.getElementById('cariSiswaInput').value.trim();
  const kelas = document.getElementById('cariSiswaKelas').value;
  const dari = document.getElementById('cariSiswaDari').value;
  const sampai = document.getElementById('cariSiswaSampai').value;
  const el = document.getElementById('cariSiswaHasil');
  el.innerHTML = '<div class="text-muted small">Mencari...</div>';
  try {
    const r = await api('cariSiswa', { q: q, kelas: kelas, dari: dari, sampai: sampai });
    if (!r.ok) { el.innerHTML = '<div class="alert alert-danger small">' + r.msg + '</div>'; return; }
    if (!r.data.length) { el.innerHTML = '<div class="alert alert-warning small">Tidak ada siswa yang cocok.</div>'; return; }
    let html = '<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr>' +
      '<th>No</th><th>Nama</th><th>Tanggal</th>' +
      '<th>TW</th><th>TL</th><th>S</th><th>I</th><th>A</th><th>B</th></tr></thead><tbody>';
    r.data.forEach((s, i) => {
      html += '<tr><td>' + (i+1) + '</td>' +
        '<td><strong>' + s.nama + '</strong><br><small class="text-muted">' + s.nisn + ' • ' + s.kelas + '</small></td>' +
        '<td><small>' + (s.periode || '-') + '</small></td>' +
        '<td class="text-center">' + s.TW + '</td>' +
        '<td class="text-center">' + s.TL + '</td>' +
        '<td class="text-center">' + s.S + '</td>' +
        '<td class="text-center">' + s.I + '</td>' +
        '<td class="text-center text-danger">' + s.A + '</td>' +
        '<td class="text-center text-danger">' + s.B + '</td></tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div class="alert alert-danger small">Gagal: ' + e.message + '</div>';
  }
}

/*******************************************************
 * FINGERPRINT
 *******************************************************/
function updateFingerprintButton(who) {
  if (!currentUser) return;
  if (who === 'siswa') {
    const btn = document.getElementById('btnFingerprint');
    if (!btn) return;
    btn.innerHTML = currentUser.hasFingerprint ? '<i class="bi bi-fingerprint"></i> Absen Sidik Jari' : '<i class="bi bi-fingerprint"></i> Daftarkan Sidik Jari';
  } else if (who === 'guru') {
    const btn = document.getElementById('guruBtnFingerprint');
    if (!btn) return;
    btn.innerHTML = currentUser.hasFingerprint ? '<i class="bi bi-fingerprint"></i> Absen Sidik Jari' : '<i class="bi bi-fingerprint"></i> Daftarkan Sidik Jari';
  }
}
function b64(buffer) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer))); }

async function handleFingerprint() {
  if (!currentUser || currentUser.role !== 'siswa') { showPopup('Login sebagai siswa dulu', false); return; }
  if (!currentSesiAktif) { showPopup('Tidak ada sesi berlangsung', false); return; }
  showLoading('Memeriksa izin...');
  const cek = await api('cekIzinFpUser', { id: currentUser.user.id });
  if (!cek.ok || !cek.allowed) { showPopup('Anda tidak diizinkan absen sidik jari hari ini.', false, 2500); return; }
  const sesi = currentSesiAktif.sesi;
  if (!window.PublicKeyCredential) { showPopup('HP tidak mendukung sidik jari', false); return; }
  try {
    if (!currentUser.hasFingerprint) {
      showLoading('Mendaftarkan sidik jari...');
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(currentUser.user.id);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge, rp: { name: 'Absensi Online' },
          user: { id: userId, name: currentUser.user.id, displayName: currentUser.user.nama },
          pubKeyCredParams: [{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}],
          authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
          timeout: 60000, attestation: 'none'
        }
      });
      if (!cred) throw new Error('Registrasi dibatalkan');
      const reg = await api('registerFingerprint', {
        id: currentUser.user.id, nama: currentUser.user.nama,
        role: 'siswa', credentialId: b64(cred.rawId), publicKey: ''
      });
      if (!reg.ok) { showPopup(reg.msg, false); return; }
      currentUser.hasFingerprint = true;
      saveSession();
      updateFingerprintButton('siswa');
      showPopup('✅ Sidik jari terdaftar. Tekan lagi untuk absen.', true, 2000);
    } else {
      showLoading('Verifikasi sidik jari...');
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({ publicKey: { challenge: challenge, timeout: 60000, userVerification: 'required' } });
      const r = await api('absenFingerprint', { id: currentUser.user.id, nama: currentUser.user.nama, role: 'siswa', sesi: sesi });
      showPopup(r.msg, r.ok, r.ok ? 1200 : 2200);
      if (r.ok) { if (navigator.vibrate) navigator.vibrate(200); muatRiwayat(); muatRekapRealtime(); }
    }
  } catch(e) {
    if (e.name === 'NotAllowedError') showPopup('Dibatalkan / tidak ada sidik jari', false, 2000);
    else showPopup('Error: '+e.message, false, 2500);
  }
}

async function handleGuruFingerprint() {
  if (!currentUser || currentUser.role !== 'guru') { showPopup('Login sebagai guru dulu', false); return; }
  if (!currentSesiAktif) { showPopup('Tidak ada sesi berlangsung', false); return; }
  showLoading('Memeriksa izin...');
  const cek = await api('cekIzinFpUser', { id: currentUser.user.id });
  if (!cek.ok || !cek.allowed) { showPopup('Anda tidak diizinkan absen sidik jari hari ini.', false, 2500); return; }
  const sesi = currentSesiAktif.sesi;
  if (!window.PublicKeyCredential) { showPopup('HP tidak mendukung sidik jari', false); return; }
  try {
    if (!currentUser.hasFingerprint) {
      showLoading('Mendaftarkan sidik jari...');
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(currentUser.user.id);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge, rp: { name: 'Absensi Online' },
          user: { id: userId, name: currentUser.user.id, displayName: currentUser.user.nama },
          pubKeyCredParams: [{alg:-7,type:'public-key'},{alg:-257,type:'public-key'}],
          authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
          timeout: 60000, attestation: 'none'
        }
      });
      if (!cred) throw new Error('Registrasi dibatalkan');
      const reg = await api('registerFingerprint', {
        id: currentUser.user.id, nama: currentUser.user.nama,
        role: 'guru', credentialId: b64(cred.rawId), publicKey: ''
      });
      if (!reg.ok) { showPopup(reg.msg, false); return; }
      currentUser.hasFingerprint = true;
      saveSession();
      updateFingerprintButton('guru');
      showPopup('✅ Sidik jari terdaftar. Tekan lagi untuk absen.', true, 2000);
    } else {
      showLoading('Verifikasi sidik jari...');
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({ publicKey: { challenge: challenge, timeout: 60000, userVerification: 'required' } });
      const r = await api('absenFingerprint', { id: currentUser.user.id, nama: currentUser.user.nama, role: 'guru', sesi: sesi });
      showPopup(r.msg, r.ok, r.ok ? 1200 : 2200);
      if (r.ok) { if (navigator.vibrate) navigator.vibrate(200); muatRiwayat(); muatRekapRealtime(); }
    }
  } catch(e) {
    if (e.name === 'NotAllowedError') showPopup('Dibatalkan / tidak ada sidik jari', false, 2000);
    else showPopup('Error: '+e.message, false, 2500);
  }
}

/*******************************************************
 * QR SCANNER
 *******************************************************/
function onQRModeChange() {
  const mode = document.getElementById('qrModeScan').value;
  const manual = mode === 'manual';
  document.getElementById('qrManualBox').classList.toggle('hidden', !manual);
  document.getElementById('qrKameraBox').classList.toggle('hidden', manual);
  if (manual) qrTutupKamera();
}
async function qrBukaKamera() {
  if (qrScanning) return;
  try {
    qrScanner = new Html5Qrcode("guruReader");
    qrScanning = true;
    await qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      txt => onQRScanSuccess(txt), () => {}
    );
    document.getElementById('qrBtnBuka').disabled = true;
  } catch(e) { qrScanning = false; showPopup('Gagal buka kamera: '+e.message, false); }
}
async function qrTutupKamera() {
  if (qrScanner && qrScanning) {
    try { await qrScanner.stop(); await qrScanner.clear(); } catch(e){}
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
  try {
    const r = await api('scan', {
      scannerRole: currentUser.role, scannerId: currentUser.user.id,
      barcode: String(barcode), sesi: currentSesiAktif.sesi
    });
    showPopup(r.msg, r.ok, r.ok ? 1200 : 2200);
    if (r.ok) { if (navigator.vibrate) navigator.vibrate(200); muatRiwayat(); muatRekapRealtime(); }
  } catch(e) { showPopup('Gagal: '+e.message, false, 2500); }
}
function qrSubmitManual() {
  const v = document.getElementById('qrManualBarcode').value.trim();
  if (!v) return;
  qrProsesScan(v);
  document.getElementById('qrManualBarcode').value = '';
}

/*******************************************************
 * IZIN / SAKIT
 *******************************************************/
async function simpanIzin() {
  const role = document.getElementById('izinRole').value;
  const id = document.getElementById('izinId').value.trim();
  const nama = document.getElementById('izinNama').value.trim();
  const sesi = document.getElementById('izinSesiSelect').value;
  const ket = document.getElementById('izinKet').value;
  if (!id || !nama || !sesi) { showPopup('ID, Nama, dan Sesi wajib diisi', false); return; }
  if (currentUser.role === 'guru' && role === 'guru') { showPopup('Guru tidak bisa input izin guru', false); return; }
  showLoading('Menyimpan izin...');
  const r = await api('simpanIzin', { role: role, id: id, nama: nama, sesi: sesi, keterangan: ket });
  if (r.ok) {
    document.getElementById('izinId').value = '';
    document.getElementById('izinNama').value = '';
    muatRiwayat(); muatRekapRealtime();
  }
  showPopup(r.msg, r.ok);
}

/*******************************************************
 * REKAP PERIODE
 *******************************************************/
async function muatRekapPeriode() {
  const dari = document.getElementById('rekapDari').value;
  const sampai = document.getElementById('rekapSampai').value;
  const role = document.getElementById('rekapRole').value;
  if (!dari || !sampai) { showPopup('Isi tanggal dari & sampai', false); return; }
  if (currentUser.role === 'guru' && role === 'guru') { showPopup('Guru tidak bisa lihat rekap guru', false); return; }
  const el = document.getElementById('rekapPeriodeHasil');
  el.innerHTML = '<div class="text-muted small">Memuat...</div>';
  try {
    const r = await api('rekapPeriode', { dari: dari, sampai: sampai, role: role });
    if (!r.ok) { el.innerHTML = '<div class="alert alert-danger small">' + r.msg + '</div>'; return; }
    if (!r.data.length) { el.innerHTML = '<div class="alert alert-warning small">Tidak ada data.</div>'; return; }
    let html = '<table class="table table-sm table-striped"><thead><tr>' +
      '<th>No</th><th>Nama</th><th>TW</th><th>TL</th><th>I</th><th>S</th><th>A</th><th>B</th><th>%</th>' +
      '</tr></thead><tbody>';
    r.data.forEach((u, i) => {
      const p = u.persen;
      const cls = p >= 80 ? 'text-success fw-bold' : (p >= 60 ? 'text-warning fw-bold' : 'text-danger fw-bold');
      html += '<tr><td>' + (i+1) + '</td><td>' + u.nama + '</td>' +
        '<td>' + u.TW + '</td><td>' + u.TL + '</td>' +
        '<td>' + u.IZIN + '</td><td>' + u.SAKIT + '</td>' +
        '<td>' + u.ALPA + '</td><td>' + u.BOLOS + '</td>' +
        '<td class="' + cls + '">' + p + '%</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="alert alert-danger small">Gagal: ' + e.message + '</div>'; }
}

/*******************************************************
 * CEK SYARAT
 *******************************************************/
async function cekSyaratSaya() {
  if (!currentUser || currentUser.role !== 'siswa') { showPopup('Login sebagai siswa dulu', false); return; }
  showLoading('Menghitung...');
  try {
    const r = await api('cekSyaratKelas', { nisn: currentUser.user.id });
    if (!r.ok) { showPopup(r.msg, false); return; }
    const s = r.stat;
    const ok = r.memenuhi;
    const color = ok ? '#22c55e' : '#ef4444';
    const bgColor = ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)';
    document.getElementById('syaratHasil').innerHTML =
      '<div style="background:' + bgColor + ';border-left:4px solid ' + color + ';padding:10px;border-radius:8px;">' +
        '<div style="font-size:.95rem;font-weight:700;color:' + color + ';margin-bottom:4px;">' +
          (ok ? '✅' : '❌') + ' ' + r.pesan +
        '</div>' +
        '<div style="font-size:.8rem;">Kehadiran: <strong style="color:' + color + '">' + s.persen + '%</strong> (min 80%)</div>' +
      '</div>' +
      '<div class="small text-muted mt-2" style="font-size:.7rem;">📅 ' + r.periode.mulai + ' s/d ' + r.periode.akhir + '</div>' +
      '<table class="table table-sm mt-2" style="font-size:.75rem;">' +
        '<tr><td>Hari sekolah</td><td class="text-end"><strong>' + s.totalHariSekolah + '</strong></td></tr>' +
        '<tr><td>Sesi efektif</td><td class="text-end"><strong>' + s.totalSesiEfektif + '</strong></td></tr>' +
        '<tr><td>✅ TW</td><td class="text-end"><strong>' + s.hadirTW + '</strong></td></tr>' +
        '<tr><td>🟡 TL</td><td class="text-end"><strong>' + s.hadirTL + '</strong></td></tr>' +
        '<tr><td>📝 Izin</td><td class="text-end"><strong>' + s.izin + '</strong></td></tr>' +
        '<tr><td>🤒 Sakit</td><td class="text-end"><strong>' + s.sakit + '</strong></td></tr>' +
        '<tr><td>❌ Alpa</td><td class="text-end"><strong class="text-danger">' + s.alpa + '</strong></td></tr>' +
        '<tr><td>🚫 Bolos</td><td class="text-end"><strong class="text-danger">' + s.bolos + '</strong></td></tr>' +
      '</table>';
    closePopup();
  } catch(e) { showPopup('Gagal: '+e.message, false, 2500); }
}

/*******************************************************
 * GURU - NILAI
 *******************************************************/
async function initGuruNilai() {
  if (!currentUser) return;
  try {
    let mapelList = [], kelasList = [];
    if (currentUser.role === 'guru') {
      const rM = await api('getMapelGuru', { nip: currentUser.user.id });
      const rK = await api('getKelasGuru', { nip: currentUser.user.id });
      mapelList = rM.ok ? rM.mapel : [];
      kelasList = rK.ok ? rK.kelas : [];
    } else if (currentUser.role === 'admin') {
      const rM = await api('listMapel');
      const rK = await api('listKelas');
      mapelList = rM.ok ? rM.mapel : [];
      kelasList = rK.ok ? rK.kelas : [];
    }
    guruMapelList = mapelList;
    guruKelasList = kelasList;
    ['inputMapel','daftarMapel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = mapelList.length ? mapelList.map(m => '<option value="' + m + '">' + m + '</option>').join('') : '<option value="">(Belum ada)</option>';
    });
    ['inputKelas','daftarKelas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = kelasList.length ? kelasList.map(k => '<option value="' + k + '">' + k + '</option>').join('') : '<option value="">(Belum ada)</option>';
    });
    loadSiswaUntukInput();
    loadDaftarNilai();
  } catch(e) {}
}

async function loadSiswaUntukInput() {
  const kelas = document.getElementById('inputKelas').value;
  const body = document.getElementById('inputNilaiBody');
  if (!kelas) { body.innerHTML = '<div class="text-muted small">Pilih kelas dulu.</div>'; return; }
  const r = await api('getSiswaByKelas', { kelas: kelas });
  if (!r.ok || !r.data.length) { body.innerHTML = '<div class="text-muted small">Tidak ada siswa.</div>'; return; }
  currentSiswaInput = r.data;
  let html = '<div class="table-wrap" style="max-height:400px;"><table class="table table-sm"><thead><tr><th style="width:36px">No</th><th>Nama</th><th style="width:90px">Nilai</th></tr></thead><tbody>';
  r.data.forEach((s, i) => {
    html += '<tr><td>' + (i+1) + '</td><td><span style="font-size:.82rem">' + s.nama + '</span><br><small class="text-muted">' + s.nisn + '</small></td>' +
      '<td><input type="number" class="form-control form-control-sm nilai-input" data-nisn="' + s.nisn + '" placeholder="0" min="0" max="100"></td></tr>';
  });
  html += '</tbody></table></div>';
  body.innerHTML = html;
}

async function simpanNilaiMassal() {
  const jenis = document.getElementById('inputJenisNilai').value.trim();
  const mapel = document.getElementById('inputMapel').value;
  const kelas = document.getElementById('inputKelas').value;
  if (!jenis) { showPopup('Isi jenis nilai dulu', false); return; }
  if (!mapel || !kelas) { showPopup('Pilih mapel & kelas', false); return; }
  const inputs = document.querySelectorAll('#inputNilaiBody .nilai-input');
  const data = [];
  inputs.forEach(inp => {
    const nisn = inp.dataset.nisn;
    const nilai = inp.value.trim();
    if (nilai !== '') {
      const s = currentSiswaInput.find(x => x.nisn === nisn);
      data.push({ nisn: nisn, nama: s ? s.nama : '', nilai: nilai });
    }
  });
  if (!data.length) { showPopup('Belum ada nilai', false); return; }
  showLoading('Menyimpan ' + data.length + ' nilai...');
  try {
    const r = await api('simpanNilai', {
      nip: currentUser.user.id, namaGuru: currentUser.user.nama,
      mapel: mapel, kelas: kelas, jenisNilai: jenis, data: data
    });
    showPopup(r.msg, r.ok, r.ok ? 1800 : 2500);
    if (r.ok) { document.getElementById('inputJenisNilai').value = ''; loadSiswaUntukInput(); loadDaftarNilai(); }
  } catch(e) { showPopup('Gagal: '+e.message, false, 2500); }
}

async function loadDaftarNilai() {
  const mapel = document.getElementById('daftarMapel').value;
  const kelas = document.getElementById('daftarKelas').value;
  const el = document.getElementById('daftarNilaiHasil');
  if (!mapel || !kelas) { el.innerHTML = '<div class="text-muted small">Pilih mapel & kelas.</div>'; return; }
  showLoading('Memuat...');
  try {
    const r = await api('getDaftarNilai', { mapel: mapel, kelas: kelas });
    closePopup();
    if (!r.ok) { showPopup(r.msg, false); return; }
    if (!r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada siswa.</div>'; return; }
    if (!r.jenis.length) { el.innerHTML = '<div class="text-muted small">Belum ada nilai.</div>'; return; }
    let html = '<table class="table table-sm table-striped" style="font-size:.78rem;"><thead><tr><th>No</th><th>Nama</th>';
    r.jenis.forEach(j => { html += '<th class="text-center">' + j + '</th>'; });
    html += '</tr></thead><tbody>';
    r.data.forEach((s, i) => {
      html += '<tr><td>' + (i+1) + '</td><td>' + s.nama + '<br><small class="text-muted">' + s.nisn + '</small></td>';
      r.jenis.forEach(j => {
        const v = s.nilai[j] !== undefined ? s.nilai[j] : '-';
        html += '<td class="text-center">' + v + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch(e) { showPopup('Gagal: '+e.message, false, 2500); }
}

/*******************************************************
 * KELULUSAN
 *******************************************************/
async function cekKelulusan() {
  const nisn = document.getElementById('kelulusanNisn').value.trim();
  if (!nisn) { showPopup('Masukkan NISN', false); return; }
  const el = document.getElementById('kelulusanHasil');
  el.innerHTML = '<div class="text-muted small">Memeriksa...</div>';
  try {
    const r = await api('cekSyaratKelas', { nisn: nisn });
    if (!r.ok) { el.innerHTML = '<div class="alert alert-danger small">' + r.msg + '</div>'; return; }
    const s = r.stat;
    const ok = r.memenuhi;
    const color = ok ? '#22c55e' : '#ef4444';
    const bgColor = ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)';
    el.innerHTML =
      '<div style="background:' + bgColor + ';border-left:4px solid ' + color + ';padding:12px;border-radius:8px;">' +
        '<div style="font-weight:700;">' + r.siswa.nama + ' (' + r.siswa.kelas + ')</div>' +
        '<div style="font-size:1rem;font-weight:700;color:' + color + ';margin-top:6px;">' + (ok ? '✅' : '❌') + ' ' + r.pesan + '</div>' +
        '<div style="font-size:.85rem;">Persentase: <strong>' + s.persen + '%</strong></div>' +
      '</div>' +
      '<table class="table table-sm mt-2" style="font-size:.78rem;">' +
        '<tr><td>Hari sekolah</td><td class="text-end">' + s.totalHariSekolah + '</td></tr>' +
        '<tr><td>Total sesi</td><td class="text-end">' + s.totalSesiEfektif + '</td></tr>' +
        '<tr><td>TW / TL</td><td class="text-end">' + s.hadirTW + ' / ' + s.hadirTL + '</td></tr>' +
        '<tr><td>Izin / Sakit</td><td class="text-end">' + s.izin + ' / ' + s.sakit + '</td></tr>' +
        '<tr><td>Alpa / Bolos</td><td class="text-end text-danger"><strong>' + s.alpa + ' / ' + s.bolos + '</strong></td></tr>' +
      '</table>';
  } catch(e) { el.innerHTML = '<div class="alert alert-danger small">Gagal: ' + e.message + '</div>'; }
}

/*******************************************************
 * ADMIN - PENGATURAN
 *******************************************************/
function toggleAccordion(id) {
  const el = document.getElementById(id);
  const header = el.previousElementSibling;
  if (!el) return;
  const isOpen = el.classList.contains('open');
  if (isOpen) {
    el.classList.remove('open');
    if (header) header.classList.remove('open');
  } else {
    el.classList.add('open');
    if (header) header.classList.add('open');
    // Load data saat dibuka
    if (id === 'acc-sesi') renderSesiList();
    if (id === 'acc-libur') adminLoadLibur();
    if (id === 'acc-izinfp') adminLoadIzinFp();
    if (id === 'acc-user') { adminLoadUsers(); adminLoadFp(); }
    if (id === 'acc-fitur') adminLoadFitur();
    if (id === 'acc-historis') muatHistoris();
  }
}

function adminLoadAll() {
  renderSesiList();
  adminLoadLibur();
  adminLoadIzinFp();
  adminLoadUsers();
  adminLoadFp();
  adminLoadFitur();
  muatHistoris();
}

/*******************************************************
 * ADMIN - SESI
 *******************************************************/
function renderSesiList() {
  const el = document.getElementById('sesiList');
  if (!el) return;
  if (!currentSesiList.length) { el.innerHTML = '<div class="text-muted small">Belum ada sesi.</div>'; return; }
  el.innerHTML = currentSesiList.map(s =>
    '<div class="d-flex justify-content-between align-items-center border-bottom py-1">' +
      '<div><strong style="font-size:.85rem">' + s.sesi + '</strong><br><small class="text-muted">TW ' + s.mulaiTW + '-' + s.batasTW + ' | TL ' + s.batasTW + '-' + s.batasTL + '</small></div>' +
      '<button class="btn btn-danger btn-sm py-0 px-2" onclick="adminHapusSesi(\'' + s.sesi + '\')"><i class="bi bi-trash"></i></button>' +
    '</div>'
  ).join('');
}
async function adminTambahSesi() {
  const namaSesi = document.getElementById('newSesiNama').value.trim();
  const mulaiTW  = document.getElementById('newSesiMulaiTW').value;
  const batasTW  = document.getElementById('newSesiBatasTW').value;
  const batasTL  = document.getElementById('newSesiBatasTL').value;
  if (!namaSesi || !mulaiTW || !batasTW || !batasTL) { showPopup('Semua field wajib diisi', false); return; }
  showLoading('Menyimpan sesi...');
  const r = await api('tambahSesi', { sesi: namaSesi, mulaiTW: mulaiTW, batasTW: batasTW, batasTL: batasTL, tutup: batasTL });
  if (r.ok) { document.getElementById('newSesiNama').value = ''; await muatSesi(); renderSesiList(); }
  showPopup(r.msg, r.ok);
}
async function adminHapusSesi(sesi) {
  if (!confirm('Hapus ' + sesi + '?')) return;
  showLoading('Menghapus...');
  const r = await api('hapusSesi', { sesi: sesi });
  if (r.ok) { await muatSesi(); renderSesiList(); }
  showPopup(r.msg, r.ok);
}

/*******************************************************
 * ADMIN - LIBUR
 *******************************************************/
async function adminSimpanLibur() {
  const tanggal = document.getElementById('liburTanggal').value;
  const keterangan = document.getElementById('liburKet').value.trim();
  if (!tanggal || !keterangan) { showPopup('Tanggal & keterangan wajib', false); return; }
  showLoading('Menyimpan...');
  const r = await api('simpanLibur', { tanggal: tanggal, keterangan: keterangan });
  if (r.ok) { document.getElementById('liburKet').value = ''; adminLoadLibur(); refreshStatusHariIni(); }
  showPopup(r.msg, r.ok);
}
async function adminLoadLibur() {
  const r = await api('listLibur');
  const el = document.getElementById('liburList');
  if (!el) return;
  if (!r.ok || !r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada hari libur.</div>'; return; }
  el.innerHTML = r.data.map(l =>
    '<div class="d-flex justify-content-between align-items-center border-bottom py-1">' +
      '<div><small>' + l.tanggal + ' — ' + l.keterangan + '</small></div>' +
      '<button class="btn btn-danger btn-sm py-0 px-2" onclick="adminHapusLibur(\'' + l.tanggal + '\')"><i class="bi bi-trash"></i></button>' +
    '</div>'
  ).join('');
}
async function adminHapusLibur(tanggal) {
  if (!confirm('Hapus libur ' + tanggal + '?')) return;
  showLoading('Menghapus...');
  const r = await api('hapusLibur', { tanggal: tanggal });
  if (r.ok) { adminLoadLibur(); refreshStatusHariIni(); }
  showPopup(r.msg, r.ok);
}

/*******************************************************
 * ADMIN - IZIN FP
 *******************************************************/
async function adminLoadIzinFp() {
  showLoading('Memuat...');
  try {
    const r = await api('listIzinFpAll');
    closePopup();
    if (!r.ok) { showPopup(r.msg, false); return; }
    izinFpData = r.data || [];
    renderIzinFpList();
  } catch(e) { showPopup('Gagal: '+e.message, false, 2500); }
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
  if (filterStatus === 'denied')  list = list.filter(u => !u.allowed);
  if (search) list = list.filter(u => String(u.nama).toLowerCase().indexOf(search) >= 0 || String(u.id).toLowerCase().indexOf(search) >= 0);
  const totalOn = izinFpData.filter(u => u.allowed).length;
  document.getElementById('izinFpCount').textContent = list.length;
  document.getElementById('izinFpCountOn').textContent = totalOn;
  if (!list.length) { el.innerHTML = '<div class="text-muted small p-3 text-center">Tidak ada user.</div>'; return; }
  el.innerHTML = list.map(u => {
    const alasan = u.allowed && u.alasan ? '<div class="small text-success">📌 ' + u.alasan + '</div>' : '';
    return '<div class="switch-row">' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="label" style="font-size:.85rem">' + u.nama + '</div>' +
        '<div class="desc" style="font-size:.7rem">' + u.id + ' • ' + u.role + ' ' + (u.extra || '') + '</div>' +
        alasan + '</div>' +
      '<label class="switch"><input type="checkbox" ' + (u.allowed ? 'checked' : '') +
             ' onchange="adminToggleIzinFp(\'' + u.id + '\', this.checked)"><span class="slider"></span></label>' +
    '</div>';
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
  try {
    const r = allowed
      ? await api('setIzinFp', { id: id, nama: user.nama, role: user.role, alasan: alasan })
      : await api('hapusIzinFp', { id: id });
    if (!r.ok) { user.allowed = !allowed; user.alasan = ''; renderIzinFpList(); showPopup(r.msg, false, 1800); return; }
    showPopup(r.msg, true, 1000);
  } catch(e) { user.allowed = !allowed; renderIzinFpList(); showPopup('Gagal: '+e.message, false, 2200); }
}
async function adminBulkIzinFp(allowed) {
  const filterRole = document.getElementById('izinFpFilterRole').value;
  const filterStatus = document.getElementById('izinFpFilterStatus').value;
  const search = (document.getElementById('izinFpSearch').value || '').toLowerCase().trim();
  let list = izinFpData.slice();
  if (filterRole !== 'all') list = list.filter(u => u.role === filterRole);
  if (filterStatus === 'allowed') list = list.filter(u => u.allowed);
  if (filterStatus === 'denied')  list = list.filter(u => !u.allowed);
  if (search) list = list.filter(u => String(u.nama).toLowerCase().indexOf(search) >= 0 || String(u.id).toLowerCase().indexOf(search) >= 0);
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
  try {
    const ids = target.map(u => u.id);
    const r = await api('setIzinFpBulk', { ids: ids, allowed: allowed, alasan: alasan });
    if (r.ok) await adminLoadIzinFp();
    else showPopup(r.msg, false);
  } catch(e) { showPopup('Gagal: '+e.message, false, 2500); }
}

/*******************************************************
 * ADMIN - USER & FP
 *******************************************************/
async function adminLoadUsers() {
  const r = await api('listUsers');
  const el = document.getElementById('userList');
  if (!el) return;
  if (!r.ok || !r.data.length) { el.innerHTML = '<div class="text-muted small">Tidak ada user.</div>'; return; }
  el.innerHTML = r.data.map(u =>
    '<div class="d-flex justify-content-between align-items-center border-bottom py-1">' +
      '<div><strong style="font-size:.85rem">' + u.nama + '</strong><br><small class="text-muted">' + u.id + ' • ' + u.role + '</small></div>' +
      '<button class="btn btn-secondary btn-sm py-0 px-2" onclick="adminResetPin(\'' + u.id + '\',\'' + u.nama + '\')"><i class="bi bi-key"></i></button>' +
    '</div>'
  ).join('');
}
async function adminResetPin(id, nama) {
  const newPin = prompt('PIN baru untuk ' + nama + ' (4 digit):');
  if (!newPin) return;
  if (!/^\d{4}$/.test(newPin)) { showPopup('PIN harus 4 digit', false); return; }
  showLoading('Menyimpan...');
  const r = await api('resetPin', { id: id, newPin: newPin });
  showPopup(r.msg, r.ok);
}
async function adminLoadFp() {
  const r = await api('listFingerprint');
  const el = document.getElementById('fpList');
  if (!el) return;
  if (!r.ok || !r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada sidik jari.</div>'; return; }
  el.innerHTML = r.data.map(f =>
    '<div class="d-flex justify-content-between align-items-center border-bottom py-1">' +
      '<div><strong style="font-size:.85rem">' + f.nama + '</strong><br><small class="text-muted">' + f.id + ' • ' + f.role + '</small></div>' +
      '<button class="btn btn-danger btn-sm py-0 px-2" onclick="adminResetFp(\'' + f.id + '\',\'' + f.nama + '\')"><i class="bi bi-trash"></i></button>' +
    '</div>'
  ).join('');
}
async function adminResetFp(id, nama) {
  if (!confirm('Reset sidik jari ' + nama + '?')) return;
  showLoading('Mereset...');
  const r = await api('resetFingerprint', { id: id });
  if (r.ok) adminLoadFp();
  showPopup(r.msg, r.ok);
}

/*******************************************************
 * ADMIN - FITUR
 *******************************************************/
async function adminLoadFitur() {
  const r = await api('getFitur');
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
    izinIzinSakitGuru:  document.getElementById('fitIzinGuru').checked  ? 'YA' : 'TIDAK',
    tanggalMulaiHitung: document.getElementById('fitTglMulai').value || '',
    tanggalAkhirHitung: document.getElementById('fitTglAkhir').value || ''
  };
  showLoading('Menyimpan...');
  const r = await api('setFitur', { fitur: updates });
  if (r.ok) fiturGlobal = Object.assign(fiturGlobal, updates);
  showPopup(r.msg, r.ok);
}

/*******************************************************
 * ADMIN - HISTORIS & ARSIP
 *******************************************************/
async function muatHistoris() {
  const el = document.getElementById('historisHasil');
  if (!el) return;
  el.innerHTML = '<div class="text-muted small">Memuat...</div>';
  try {
    const r = await api('historis');
    if (!r.ok) { el.innerHTML = '<div class="alert alert-danger small">' + r.msg + '</div>'; return; }
    if (!r.data.length) { el.innerHTML = '<div class="text-muted small">Belum ada aktivitas.</div>'; return; }
    let html = '<table class="table table-sm table-striped" style="font-size:.75rem;"><thead><tr>' +
      '<th>Waktu</th><th>Aksi</th><th>Oleh</th><th>Detail</th></tr></thead><tbody>';
    r.data.slice(0, 50).forEach(h => {
      html += '<tr><td><small>' + h.timestamp + '</small></td>' +
        '<td><span class="badge bg-info">' + h.aksi + '</span></td>' +
        '<td><small>' + h.oleh + '</small></td>' +
        '<td><small>' + h.detail + '</small></td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="alert alert-danger small">Gagal: ' + e.message + '</div>'; }
}

async function adminArsipManual() {
  if (!confirm('Arsip data kehadiran lama ke sheet Historis?\nData hari ini tetap di sheet Kehadiran.\n\nLanjutkan?')) return;
  showLoading('Mengarsipkan data...');
  try {
    const r = await api('arsipManual');
    showPopup(r.msg, r.ok, 3000);
    if (r.ok) { muatHistoris(); muatRekapRealtime(); }
  } catch(e) { showPopup('Gagal: '+e.message, false, 3000); }
}

async function adminPasangTrigger() {
  if (!confirm('Pasang trigger arsip otomatis?\nData akan diarsip setiap 2 hari sekali jam 23:59.')) return;
  showLoading('Memasang trigger...');
  try {
    const r = await api('pasangTrigger');
    showPopup(r.msg, r.ok, 3000);
    if (r.ok) {
      const info = document.getElementById('infoArsip');
      if (info) info.innerHTML = '✅ Trigger: <strong>aktif</strong> — arsip otomatis setiap 2 hari jam 23:59.';
    }
  } catch(e) { showPopup('Gagal: '+e.message, false, 3000); }
}

/*******************************************************
 * EVENT LISTENERS
 *******************************************************/
document.addEventListener('keypress', (e) => {
  if (e.target.id === 'loginInput' && e.key === 'Enter') doLogin();
  if (e.target.id === 'qrManualBarcode' && e.key === 'Enter') qrSubmitManual();
});
document.addEventListener('input', (e) => {
  if (['loginInput','qrManualBarcode','izinId'].indexOf(e.target.id) >= 0) {
    e.target.value = e.target.value.replace(/\D/g,'');
  }
});
const lm = document.getElementById('loginModalOverlay');
if (lm) lm.addEventListener('click', (e) => { if (e.target.id === 'loginModalOverlay') closeLoginPopup(); });
