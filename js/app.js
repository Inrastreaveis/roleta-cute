(() => {
  const $ = id => document.getElementById(id);
  const sb = window.roletaSupabase;
  const api = window.roletaSupabaseApi;
  let state = { participants: [], settings: {}, links: [] };
  let spinning = false;
  let deviceRegistration = { checked: false, registered: false, participant: null };

  function deviceToken() {
    let token = localStorage.getItem('roleta_cute_device_token');
    if (!token) {
      token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
      localStorage.setItem('roleta_cute_device_token', token);
    }
    return token;
  }
  async function deviceHash() {
    const bytes = new TextEncoder().encode(deviceToken());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  function setBackground(settings) {
    document.body.dataset.theme = settings.theme || 'pink';
    const type = settings.background_type;
    const value = settings.background_value || '';
    if ((type === 'url' || type === 'upload') && /^https?:\/\//i.test(value)) {
      document.body.style.backgroundImage = `linear-gradient(rgba(255,246,250,.72), rgba(255,238,247,.78)), url("${value.replace(/["\\]/g, '')}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundPosition = 'center';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.backgroundPosition = '';
    }
  }

  function renderLinks(links) {
    const section = $('linksSection');
    section.replaceChildren();
    if (!links?.length) { section.hidden = true; return; }
    section.hidden = false;
    links.forEach(link => {
      const anchor = document.createElement('a');
      anchor.className = 'public-link'; anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      const icon = document.createElement('span'); icon.className = 'public-link-icon'; icon.textContent = link.icon || '💗';
      const label = document.createElement('span'); label.textContent = link.label;
      anchor.append(icon, label); anchor.style.borderColor = `${link.color || '#f3a6c8'}66`; section.append(anchor);
    });
  }

  function renderParticipants(participants) {
    const list = $('publicParticipantList'); list.replaceChildren();
    $('participantCount').textContent = String(participants.length);
    $('participantLiveCount').textContent = String(participants.length);
    if (!participants.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Seja a primeira pessoa a participar! 🌷'; list.append(empty);
    } else {
      participants.forEach((person, index) => {
        const row = document.createElement('div'); row.className = 'public-person';
        const dot = document.createElement('span'); dot.className = 'person-dot'; dot.textContent = ['♡', '✿', '✧', 'ღ'][index % 4];
        const name = document.createElement('span'); name.textContent = person.name; row.append(dot, name); list.append(row);
      });
    }
    if (!spinning) CuteWheel.draw($('wheelCanvas'), participants);
  }

  function renderJoinAvailability() {
    const paused = state.settings?.allow_join === false || state.settings?.allow_join === '0';
    const registered = deviceRegistration.registered;
    $('joinForm').hidden = !deviceRegistration.checked || paused || registered;
    $('joinPaused').hidden = !deviceRegistration.checked || !paused || registered;
    if (registered && deviceRegistration.participant) {
      $('joinMessage').textContent = `Este dispositivo já está inscrito com o nome ${deviceRegistration.participant.name}. Cada dispositivo pode participar uma única vez. 💗`;
    } else if (deviceRegistration.checked && !paused) $('joinMessage').textContent = '';
  }

  async function loadDeviceRegistration() {
    try {
      const data = await api.getDeviceStatus(await deviceHash());
      deviceRegistration = { checked: true, registered: Boolean(data?.registered), participant: data?.participant || null };
    } catch {
      deviceRegistration = { checked: true, registered: false, participant: null };
    }
    renderJoinAvailability();
  }

  function applyState(next) {
    if (!next) return;
    state = { ...state, ...next };
    const settings = state.settings || {};
    $('siteTitle').textContent = settings.site_title || 'Roleta Cute';
    $('headerTitle').textContent = settings.site_title || 'Roleta Cute';
    $('footerTitle').textContent = settings.site_title || 'Roleta Cute';
    $('siteSubtitle').textContent = settings.site_subtitle || '';
    document.title = `${settings.site_title || 'Roleta Cute'} 🎀`;
    setBackground(settings);
    renderLinks(state.links || []);
    renderParticipants(state.participants || []);
    renderJoinAvailability();
    if (settings.music_file) {
      const audio = $('siteMusic');
      if (audio.getAttribute('src') !== settings.music_file) { audio.src = settings.music_file; audio.load(); }
      $('musicToggle').hidden = !settings.music_enabled;
    } else {
      $('siteMusic').removeAttribute('src'); $('musicToggle').hidden = true; $('musicToggle').classList.remove('playing');
    }
  }

  async function loadState() {
    try { applyState(await api.getPublicState()); }
    catch (error) { $('publicWinnerNote').textContent = `Não foi possível carregar a roleta: ${error.message}`; }
  }

  function showWinner(names, subtitle) {
    $('winnerTitle').textContent = names.length > 1 ? 'Parabéns, ganhadores!' : 'Temos um ganhador!';
    $('winnerName').textContent = names.join(' · ');
    $('winnerSubtext').textContent = subtitle || 'A sorte sorriu para você! 💗';
    $('winnerModal').classList.add('show'); $('winnerModal').setAttribute('aria-hidden', 'false');
  }
  function closeWinner() { $('winnerModal').classList.remove('show'); $('winnerModal').setAttribute('aria-hidden', 'true'); }
  $('closeWinner').addEventListener('click', closeWinner);
  $('winnerModal').querySelector('.winner-backdrop').addEventListener('click', closeWinner);

  async function animateWinners(winners, replacement = false, participantSnapshot = null) {
    if (spinning || !Array.isArray(winners) || !winners.length) return;
    spinning = true;
    const canvas = $('wheelCanvas');
    const people = Array.isArray(participantSnapshot) ? participantSnapshot : state.participants;
    if (Array.isArray(participantSnapshot)) CuteWheel.draw(canvas, people);
    const names = [];
    try {
      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        $('publicWinnerNote').textContent = replacement ? 'Refazendo o sorteio... ✨' : `Sorteando ${i + 1} de ${winners.length}... ✨`;
        const duration = winners.length > 5 ? 1500 : (winners.length > 1 ? 2800 : 4700);
        await CuteWheel.spinToWinner(canvas, people, winner, { duration, turns: winners.length > 5 ? 3 : 5 + (i % 2) });
        names.push(winner.name);
        $('publicWinnerNote').textContent = `Selecionado: ${winner.name} 💗`;
      }
      showWinner(names, replacement ? 'Este nome substitui o resultado anterior. 💌' : `${winners.length} pessoa(s) foram sorteadas! 💌`);
    } finally {
      spinning = false;
      CuteWheel.draw(canvas, state.participants);
    }
  }

  $('joinForm').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('participantName');
    const button = $('joinForm').querySelector('button');
    const message = $('joinMessage');
    const name = input.value.trim();
    if (!name) return;
    button.disabled = true; button.textContent = 'Entrando...'; message.textContent = '';
    try {
      const participant = await api.registerParticipant(name, await deviceHash());
      input.value = '';
      deviceRegistration = { checked: true, registered: true, participant };
      renderJoinAvailability();
      await loadState();
    } catch (error) {
      message.textContent = error.message;
      if (String(error.message).toLowerCase().includes('já participou')) await loadDeviceRegistration();
    } finally { button.disabled = false; button.innerHTML = 'Participar <span>♡</span>'; }
  });

  $('musicToggle').addEventListener('click', async () => {
    const audio = $('siteMusic'); if (!audio.src) return;
    if (audio.paused) { try { await audio.play(); $('musicToggle').classList.add('playing'); } catch { $('publicWinnerNote').textContent = 'Toque novamente para iniciar a música. ♫'; } }
    else { audio.pause(); $('musicToggle').classList.remove('playing'); }
  });
  $('siteMusic').addEventListener('pause', () => $('musicToggle').classList.remove('playing'));
  $('siteMusic').addEventListener('play', () => $('musicToggle').classList.add('playing'));

  sb.channel('roleta-cute-public-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, loadState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, loadState)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draw_events' }, payload => {
      const event = payload.new?.payload || {};
      if (payload.new?.event_type === 'draw_started') animateWinners(event.winners || [], false, event.participants || []);
      if (payload.new?.event_type === 'draw_replacement') animateWinners([event.winner].filter(Boolean), true, event.participants || []);
    })
    .subscribe();

  Promise.all([loadState(), loadDeviceRegistration()]);
})();
