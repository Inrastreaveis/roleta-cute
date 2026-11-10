(() => {
  const $ = id => document.getElementById(id);
  const sb = window.roletaSupabase;
  const api = window.roletaSupabaseApi;
  let state = { participants: [], settings: {}, links: [], drawAccess: { authorized: false }, currentWinners: [] };
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
      const icon = document.createElement('span'); icon.className = 'public-link-icon';
      if (link.icon_type === 'image' && link.icon_image_url) {
        const image = document.createElement('img'); image.src = link.icon_image_url; image.alt = ''; image.loading = 'lazy';
        icon.append(image);
      } else icon.textContent = link.icon || '💗';
      const label = document.createElement('span'); label.textContent = link.label;
      anchor.append(icon, label); anchor.style.borderColor = `${link.color || '#f3a6c8'}66`; section.append(anchor);
    });
  }

  function renderParticipants(participants) {
    const list = $('publicParticipantList'); list.replaceChildren();
    $('participantCount').textContent = String(participants.length);
    $('participantLiveCount').textContent = String(participants.length);
    const max = Math.max(1, participants.length);
    $('publicWinnerCount').max = String(max);
    if (Number($('publicWinnerCount').value) > max) $('publicWinnerCount').value = String(max);
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

  function canDraw() { return state.drawAccess?.authorized === true; }

  function renderPublicWinners() {
    const panel = $('publicWinnersPanel');
    const list = $('publicWinnersList');
    const winners = Array.isArray(state.currentWinners) ? state.currentWinners : [];
    list.replaceChildren();
    panel.hidden = winners.length === 0;
    winners.forEach((winner, index) => {
      const row = document.createElement('div'); row.className = 'public-winner-row';
      const label = document.createElement('strong'); label.textContent = `${index + 1}. ${winner.name || winner.winner_name || 'Ganhador'}`;
      row.append(label);
      if (canDraw()) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'public-redraw-button';
        button.textContent = 'Sortear outro'; button.disabled = spinning;
        button.addEventListener('click', () => redrawPublicWinner(winner, button));
        row.append(button);
      }
      list.append(row);
    });
  }

  function renderDrawControls() {
    $('publicDrawControls').hidden = !canDraw();
    $('publicDrawUsername').textContent = state.drawAccess?.username ? `Controle liberado para ${state.drawAccess.username}` : 'Área de sorteio autorizada';
    $('publicStartDraw').disabled = !state.participants.length || spinning;
    renderPublicWinners();
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
    renderDrawControls();
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
    $('winnerName').textContent = names.join('\n');
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
    if (Array.isArray(participantSnapshot)) {
      state.participants = participantSnapshot;
      renderParticipants(participantSnapshot);
      CuteWheel.draw(canvas, people);
    }
    const names = [];
    renderDrawControls();
    try {
      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        $('publicWinnerNote').textContent = replacement ? 'Refazendo o sorteio... ✨' : `Sorteando ${i + 1} de ${winners.length}... ✨`;
        const duration = winners.length > 5 ? 1800 : (winners.length > 1 ? 3000 : 5000);
        await CuteWheel.spinToWinner(canvas, people, winner, { duration, turns: winners.length > 5 ? 4 : 6 + (i % 2) });
        names.push(winner.name);
        $('publicWinnerNote').textContent = `Selecionado: ${winner.name} 💗`;
      }
      showWinner(names, replacement ? 'Este nome substitui o resultado anterior. 💌' : `${winners.length} pessoa(s) foram sorteadas! 💌`);
    } finally {
      spinning = false;
      CuteWheel.draw(canvas, state.participants);
      renderDrawControls();
    }
  }

  async function startPublicDraw() {
    if (!canDraw() || spinning) return;
    const count = Number($('publicWinnerCount').value);
    if (!Number.isInteger(count) || count < 1 || count > state.participants.length) {
      $('publicWinnerNote').textContent = 'Escolha uma quantidade válida de ganhadores.';
      return;
    }
    $('publicStartDraw').disabled = true;
    $('publicWinnerNote').textContent = 'Preparando a roleta... ✨';
    try {
      await window.roletaApi('/api/public/draw', { method: 'POST', body: JSON.stringify({ count }) });
      $('publicWinnerNote').textContent = 'Sorteio iniciado! Boa sorte! 💗';
    } catch (error) {
      $('publicWinnerNote').textContent = error.message;
      $('publicStartDraw').disabled = false;
    }
  }

  async function redrawPublicWinner(winner, button) {
    if (!canDraw() || spinning || !winner?.id) return;
    button.disabled = true;
    $('publicWinnerNote').textContent = `Refazendo o sorteio de ${winner.name}... ✨`;
    try {
      await window.roletaApi(`/api/public/draw/${winner.id}/redraw`, { method: 'POST', body: '{}' });
    } catch (error) {
      $('publicWinnerNote').textContent = error.message;
      button.disabled = false;
    }
  }

  $('publicMinusWinner').addEventListener('click', () => {
    $('publicWinnerCount').value = String(Math.max(1, Number($('publicWinnerCount').value || 1) - 1));
  });
  $('publicPlusWinner').addEventListener('click', () => {
    const max = Math.max(1, state.participants.length);
    $('publicWinnerCount').value = String(Math.min(max, Number($('publicWinnerCount').value || 1) + 1));
  });
  $('publicStartDraw').addEventListener('click', startPublicDraw);

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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => { loadState(); loadDeviceRegistration(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, loadState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, loadState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadState)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draw_events' }, payload => {
      const event = payload.new?.payload || {};
      const type = payload.new?.event_type;
      if (type === 'draw_started') {
        state.currentWinners = event.winners || [];
        if (Array.isArray(event.participants)) state.participants = event.participants;
        renderPublicWinners();
        animateWinners(event.winners || [], false, event.participants || []);
      }
      if (type === 'draw_replacement') {
        state.currentWinners = (state.currentWinners || []).map(item => String(item.id) === String(event.oldDrawId) ? event.winner : item);
        renderPublicWinners();
        animateWinners([event.winner].filter(Boolean), true, event.participants || []);
      }
      if (type === 'draw_reset') {
        state.currentWinners = [];
        renderPublicWinners();
        $('publicWinnerNote').textContent = event.clearParticipants ? 'A roleta foi recriada e a lista de participantes foi limpa. 💗' : 'Sorteio reiniciado. Os participantes continuam na roleta. 💗';
      }
    })
    .subscribe();

  sb.auth.onAuthStateChange(() => { setTimeout(() => loadState(), 0); });
  Promise.all([loadState(), loadDeviceRegistration()]);
})();
