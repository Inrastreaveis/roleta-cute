(() => {
  const $ = id => document.getElementById(id);
  let adminState = { participants: [], settings: {}, links: [], history: [], users: [], user: null };
  let currentWinners = [];
  let isSpinning = false;
  let activeTab = 'overview';

  async function api(url, options = {}) { return window.roletaApi(url, options); }

  function message(text, isError = false) {
    const element = $('adminMessage');
    element.textContent = text;
    element.classList.toggle('error', isError);
    element.classList.add('show');
    clearTimeout(message.timer);
    message.timer = setTimeout(() => element.classList.remove('show'), 4200);
  }

  function setTab(tab) {
    if (tab === 'access' && adminState.user?.role !== 'owner') return;
    if (tab === 'draw' && !(adminState.user?.role === 'owner' || adminState.user?.can_draw === true)) return;
    activeTab = tab;
    document.querySelectorAll('.admin-tab').forEach(section => section.classList.toggle('active', section.id === `tab-${tab}`));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    const labels = { overview: 'Visão geral', participants: 'Participantes', draw: 'Sorteio', appearance: 'Aparência do site', links: 'Meus links', music: 'Música do site', access: 'Permissões de acesso', security: 'Segurança da conta' };
    $('pageHeading').textContent = labels[tab] || 'Painel';
    if (tab === 'draw') CuteWheel.draw($('adminWheelCanvas'), adminState.participants);
  }

  function safeText(element, value) { element.textContent = value ?? ''; }
  function formatDate(value) {
    if (!value) return 'Agora';
    const raw = String(value); const parsed = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function renderParticipants() {
    const people = adminState.participants || [];
    $('statParticipants').textContent = String(people.length);
    $('adminParticipantCount').textContent = String(people.length);
    $('drawAvailable').textContent = String(people.length);
    $('winnerCount').max = String(Math.max(1, people.length));
    if (Number($('winnerCount').value) > people.length && people.length) $('winnerCount').value = String(people.length);
    const list = $('adminParticipantList');
    list.replaceChildren();
    if (!people.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Ainda não há participantes.'; list.append(empty);
    } else {
      people.forEach((person, index) => {
        const row = document.createElement('div'); row.className = 'admin-person-row';
        const nameWrap = document.createElement('div'); nameWrap.className = 'admin-person-name';
        const dot = document.createElement('span'); dot.className = 'person-dot'; dot.textContent = ['♡', '✿', '✧', 'ღ'][index % 4];
        const name = document.createElement('span'); name.textContent = person.name;
        nameWrap.append(dot, name);
        const remove = document.createElement('button'); remove.className = 'icon-action'; remove.type = 'button'; remove.title = `Remover ${person.name}`; remove.textContent = '×';
        remove.addEventListener('click', () => removeParticipant(person.id, person.name));
        row.append(nameWrap, remove); list.append(row);
      });
    }
    if (!isSpinning) CuteWheel.draw($('adminWheelCanvas'), people);
  }

  async function removeParticipant(id, name) {
    if (!confirm(`Remover ${name} da roleta?`)) return;
    try { await api(`/api/admin/participants/${id}`, { method: 'DELETE' }); message(`${name} foi removido da roleta.`); await refresh(); }
    catch (error) { message(error.message, true); }
  }

  function renderLinks() {
    const links = adminState.links || [];
    $('statLinks').textContent = String(links.filter(link => Number(link.enabled)).length);
    const list = $('adminLinksList'); list.replaceChildren();
    if (!links.length) { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Você ainda não adicionou links.'; list.append(empty); return; }
    links.forEach(link => {
      const row = document.createElement('div'); row.className = 'admin-link-row';
      const icon = document.createElement('span'); icon.className = 'admin-link-icon'; icon.style.background = `${link.color || '#f3a6c8'}25`;
      if (link.icon_type === 'image' && link.icon_image_url) { const image = document.createElement('img'); image.src = link.icon_image_url; image.alt = ''; image.loading = 'lazy'; icon.append(image); }
      else icon.textContent = link.icon || '💗';
      const main = document.createElement('div'); main.className = 'admin-link-main';
      const title = document.createElement('strong'); title.textContent = link.label;
      const url = document.createElement('small'); url.textContent = link.url;
      main.append(title, url);
      const actions = document.createElement('div'); actions.className = 'link-actions';
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = Number(link.enabled) ? 'Ocultar' : 'Mostrar';
      toggle.addEventListener('click', async () => { try { await api(`/api/admin/links/${link.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !Number(link.enabled) }) }); await refresh(); message('Visibilidade do link atualizada.'); } catch (e) { message(e.message, true); } });
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar'; edit.addEventListener('click', () => editLink(link));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Excluir'; remove.addEventListener('click', async () => { if (!confirm(`Excluir o link “${link.label}”?`)) return; try { await api(`/api/admin/links/${link.id}`, { method: 'DELETE' }); await refresh(); message('Link excluído.'); } catch (e) { message(e.message, true); } });
      actions.append(toggle, edit, remove); row.append(icon, main, actions); list.append(row);
    });
  }

  function renderHistory() {
    const history = adminState.history || [];
    $('statDraws').textContent = String(history.length);
    const overview = $('overviewHistory');
    const full = $('drawHistory');
    overview.replaceChildren(); full.replaceChildren();
    if (!history.length) {
      [overview, full].forEach(list => { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Nenhum sorteio realizado ainda.'; list.append(empty); });
      return;
    }
    history.slice(0, 6).forEach(row => overview.append(createHistoryRow(row)));
    history.slice(0, 40).forEach(row => full.append(createHistoryRow(row)));
  }

  function createHistoryRow(row) {
    const item = document.createElement('div'); item.className = 'history-row';
    const main = document.createElement('div'); main.className = 'history-main';
    const medal = document.createElement('span'); medal.className = 'history-medal'; medal.textContent = Number(row.is_current) ? '🏆' : '↪';
    const copy = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = row.winner_name;
    const date = document.createElement('small'); date.textContent = formatDate(row.created_at);
    copy.append(name, date); main.append(medal, copy);
    const status = document.createElement('span'); status.className = 'history-status'; status.textContent = Number(row.is_current) ? 'Resultado atual' : 'Substituído';
    item.append(main, status); return item;
  }

  function renderUsers() {
    const list = $('adminUsersList'); list.replaceChildren();
    if (adminState.user?.role !== 'owner') { $('accessNav').hidden = true; return; }
    $('accessNav').hidden = false;
    const users = adminState.users || [];
    users.forEach(user => {
      const row = document.createElement('div'); row.className = 'admin-user-row';
      const meta = document.createElement('div'); meta.className = 'admin-user-meta';
      const avatar = document.createElement('span'); avatar.className = 'user-avatar'; avatar.textContent = user.role === 'owner' ? '👑' : '♡';
      const text = document.createElement('div');
      const username = document.createElement('strong'); username.textContent = user.username;
      const role = document.createElement('small'); role.textContent = user.role === 'owner' ? 'Proprietário' : user.role === 'admin' ? 'Administrador' : user.role === 'moderator' ? 'Moderador' : 'Aguardando autorização';
      text.append(username, role); meta.append(avatar, text);
      const badge = document.createElement('span'); badge.className = 'role-chip'; badge.textContent = role.textContent;
      row.append(meta, badge);
      if (user.role !== 'owner' && user.role !== 'pending') {
        const actions = document.createElement('div'); actions.className = 'user-access-actions';
        const drawLabel = document.createElement('label'); drawLabel.className = 'draw-permission-toggle';
        const drawCheckbox = document.createElement('input'); drawCheckbox.type = 'checkbox'; drawCheckbox.checked = user.can_draw === true;
        drawCheckbox.setAttribute('aria-label', `Permitir que ${user.username} gire a roleta`);
        drawCheckbox.addEventListener('change', async () => {
          drawCheckbox.disabled = true;
          try {
            await api(`/api/admin/users/${user.id}/draw-permission`, { method: 'PUT', body: JSON.stringify({ can_draw: drawCheckbox.checked }) });
            await refresh(); message(drawCheckbox.checked ? `Permissão para girar liberada para ${user.username}.` : `Permissão de sorteio removida de ${user.username}.`);
          } catch (e) { drawCheckbox.checked = !drawCheckbox.checked; message(e.message, true); }
          finally { drawCheckbox.disabled = false; }
        });
        const drawText = document.createElement('span'); drawText.textContent = 'Pode girar';
        drawLabel.append(drawCheckbox, drawText);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Revogar';
        remove.addEventListener('click', async () => { if (!confirm(`Revogar o acesso de ${user.username}?`)) return; try { await api(`/api/admin/users/${user.id}`, { method: 'DELETE' }); await refresh(); message('Acesso revogado.'); } catch (e) { message(e.message, true); } });
        actions.append(drawLabel, remove); row.append(actions);
      }
      list.append(row);
    });
  }

  function renderSettings() {
    const settings = adminState.settings || {};
    $('settingTitle').value = settings.site_title || 'Roleta Cute';
    $('settingSubtitle').value = settings.site_subtitle || '';
    const theme = settings.theme || 'pink';
    document.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === theme; });
    const bgType = settings.background_type || 'gradient';
    document.querySelectorAll('input[name="backgroundType"]').forEach(input => { input.checked = input.value === bgType; });
    $('backgroundUrl').value = bgType === 'url' ? (settings.background_value || '') : '';
    $('backgroundUrlWrap').hidden = bgType !== 'url';
    $('allowJoin').checked = settings.allow_join === true || settings.allow_join === '1' || typeof settings.allow_join === 'undefined';
    $('musicEnabled').checked = settings.music_enabled === true || settings.music_enabled === '1';
    $('currentMusicTitle').textContent = settings.music_title || 'Nenhuma música enviada';
    $('currentMusicDescription').textContent = settings.music_file ? 'A música está salva no armazenamento do site e pode ser tocada pelos visitantes.' : 'Envie um arquivo de áudio para colocar música no seu site.';
    $('removeMusic').hidden = !settings.music_file;
  }

  function renderWinners() {
    const container = $('currentWinners'); container.replaceChildren();
    currentWinners.forEach((winner, index) => {
      const row = document.createElement('div'); row.className = 'winner-result-row';
      const label = document.createElement('span'); label.textContent = `${index + 1}. ${winner.name}`;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Sortear outro';
      button.addEventListener('click', () => redrawWinner(winner));
      row.append(label, button); container.append(row);
    });
  }

  function hydrateLatestWinners() {
    const history = adminState.history || [];
    if (!history.length) { currentWinners = []; renderWinners(); return; }
    const latestBatch = history[0].batch_id;
    currentWinners = history.filter(row => row.batch_id === latestBatch && Number(row.is_current)).reverse().map(row => ({ id: row.id, participant_id: row.participant_id, name: row.winner_name }));
    renderWinners();
  }

  function renderAll() {
    const user = adminState.user || {};
    $('sidebarUsername').textContent = user.username || 'Conta';
    $('profileUsername').value = user.username || ''; 
    $('welcomeUser').textContent = (user.username || 'VOCÊ').toUpperCase();
    const roleLabels = { owner: 'Proprietário', admin: 'Administrador', moderator: 'Moderador', pending: 'Aguardando autorização' };
    $('sidebarRole').textContent = roleLabels[user.role] || 'Acesso';
    $('accessNav').hidden = user.role !== 'owner';
    const moderatorOnly = user.role === 'moderator';
    const drawAllowed = user.role === 'owner' || user.can_draw === true;
    $('clearParticipants').hidden = moderatorOnly;
    ['draw', 'appearance', 'links', 'music'].forEach(tab => {
      const hide = moderatorOnly || (tab === 'draw' && !drawAllowed);
      const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
      if (nav) nav.hidden = hide;
      document.querySelectorAll(`[data-goto="${tab}"]`).forEach(card => { card.hidden = hide; });
    });
    if ((user.role !== 'owner' && activeTab === 'access') || (moderatorOnly && ['draw', 'appearance', 'links', 'music'].includes(activeTab)) || (!drawAllowed && activeTab === 'draw')) setTab('overview');
    renderParticipants(); renderLinks(); renderHistory(); renderSettings(); renderUsers(); hydrateLatestWinners();
  }

  async function refresh() {
    const data = await api('/api/admin/state');
    adminState = { ...adminState, ...data };
    renderAll();
  }

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.goto)));

  $('logoutButton').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); window.location.href = './login.html'; }
    catch { window.location.href = './login.html'; }
  });

  $('adminAddParticipant').addEventListener('submit', async event => {
    event.preventDefault();
    const name = $('adminParticipantName').value.trim();
    try { await api('/api/admin/participants', { method: 'POST', body: JSON.stringify({ name }) }); $('adminParticipantName').value = ''; await refresh(); message(`${name} foi adicionado à roleta!`); }
    catch (error) { message(error.message, true); }
  });

  $('clearParticipants').addEventListener('click', async () => {
    if (!confirm('Tem certeza de que deseja limpar todos os participantes? O histórico dos sorteios será mantido.')) return;
    try { await api('/api/admin/participants', { method: 'DELETE' }); await refresh(); message('A lista de participantes foi limpa.'); }
    catch (error) { message(error.message, true); }
  });

  async function recreateDraw(clearParticipants) {
    const confirmation = clearParticipants
      ? 'Recriar o sorteio e remover TODOS os participantes? Essa ação não pode ser desfeita.'
      : 'Recriar o sorteio e manter todos os participantes inscritos? O histórico de ganhadores será apagado.';
    if (!confirm(confirmation)) return;
    try {
      await api('/api/admin/draw/reset', { method: 'POST', body: JSON.stringify({ clear_participants: clearParticipants }) });
      currentWinners = []; renderWinners();
      await refresh();
      message(clearParticipants ? 'Sorteio recriado e participantes removidos.' : 'Sorteio recriado. Os participantes foram mantidos.');
    } catch (error) { message(error.message, true); }
  }
  $('recreateKeepParticipants').addEventListener('click', () => recreateDraw(false));
  $('recreateClearParticipants').addEventListener('click', () => recreateDraw(true));
  $('clearDrawHistory').addEventListener('click', async () => {
    if (!confirm('Apagar todo o histórico de ganhadores? Os participantes continuarão inscritos.')) return;
    try {
      await api('/api/admin/draw/history', { method: 'DELETE' });
      currentWinners = []; renderWinners(); await refresh();
      message('Histórico de ganhadores apagado.');
    } catch (error) { message(error.message, true); }
  });

  $('minusWinner').addEventListener('click', () => { $('winnerCount').value = String(Math.max(1, Number($('winnerCount').value || 1) - 1)); });
  $('plusWinner').addEventListener('click', () => { $('winnerCount').value = String(Math.min(Math.max(1, adminState.participants.length), Number($('winnerCount').value || 1) + 1)); });
  $('startDraw').addEventListener('click', async () => {
    if (isSpinning) return;
    const count = Number($('winnerCount').value);
    if (!Number.isInteger(count) || count < 1) { message('Informe uma quantidade válida.', true); return; }
    $('startDraw').disabled = true;
    $('drawStatus').textContent = 'Preparando a roleta... ✨';
    try {
      const data = await api('/api/admin/draw', { method: 'POST', body: JSON.stringify({ count }) });
      $('drawStatus').textContent = 'A roleta está girando! Boa sorte! 💗';
      currentWinners = data.winners;
      renderWinners();
    } catch (error) {
      $('drawStatus').textContent = error.message;
      $('startDraw').disabled = false;
      message(error.message, true);
    }
  });

  async function redrawWinner(winner) {
    if (isSpinning) return;
    $('drawStatus').textContent = `Refazendo o sorteio de ${winner.name}...`;
    try {
      const data = await api(`/api/admin/draw/${winner.id}/redraw`, { method: 'POST', body: '{}' });
      currentWinners = currentWinners.map(item => item.id === winner.id ? data.winner : item);
      renderWinners();
      await refreshHistoryOnly();
    } catch (error) { $('drawStatus').textContent = error.message; message(error.message, true); }
  }

  async function refreshHistoryOnly() {
    const data = await api('/api/admin/state');
    adminState.history = data.history;
    renderHistory();
  }

  async function animateAdminWinners(winners, replacement = false, participantSnapshot = null) {
    if (isSpinning || !Array.isArray(winners) || !winners.length) return;
    isSpinning = true;
    $('startDraw').disabled = true;
    const canvas = $('adminWheelCanvas');
    const animationParticipants = Array.isArray(participantSnapshot) ? participantSnapshot : adminState.participants;
    if (Array.isArray(participantSnapshot)) CuteWheel.draw(canvas, animationParticipants);
    const names = [];
    try {
      for (let index = 0; index < winners.length; index++) {
        const winner = winners[index];
        $('drawStatus').textContent = replacement ? 'Girando novamente para escolher outra pessoa...' : `Sorteando ${index + 1} de ${winners.length}... ✨`;
        const duration = winners.length > 5 ? 1500 : (winners.length > 1 ? 2800 : 4800);
        await CuteWheel.spinToWinner(canvas, animationParticipants, winner, { duration, turns: winners.length > 5 ? 3 : 5 + (index % 2) });
        names.push(winner.name);
        $('drawStatus').textContent = `Selecionado: ${winner.name} 💗`;
      }
      $('adminWinnerEyebrow').textContent = replacement ? 'NOVO RESULTADO' : 'TEMOS UM RESULTADO!';
      $('adminWinnerName').textContent = names.join(' · ');
      $('adminWinnerSubtext').textContent = replacement ? 'Este nome substitui o resultado anterior.' : `${names.length} pessoa(s) foram sorteadas!`;
      $('adminWinnerModal').classList.add('show');
      $('adminWinnerModal').setAttribute('aria-hidden', 'false');
      await refreshHistoryOnly();
    } finally {
      isSpinning = false;
      $('startDraw').disabled = false;
      CuteWheel.draw(canvas, adminState.participants);
    }
  }

  function closeAdminWinner() { $('adminWinnerModal').classList.remove('show'); $('adminWinnerModal').setAttribute('aria-hidden', 'true'); }
  $('closeAdminWinner').addEventListener('click', closeAdminWinner);
  $('adminWinnerModal').querySelector('.winner-backdrop').addEventListener('click', closeAdminWinner);

  document.querySelectorAll('input[name="backgroundType"]').forEach(input => input.addEventListener('change', () => { $('backgroundUrlWrap').hidden = input.value !== 'url'; }));
  $('backgroundFile').addEventListener('change', () => { $('backgroundUploadName').textContent = $('backgroundFile').files[0]?.name || 'JPG, PNG ou WEBP · até 12 MB'; });
  $('saveAppearance').addEventListener('click', async () => {
    const type = document.querySelector('input[name="backgroundType"]:checked')?.value || 'gradient';
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'pink';
    const file = $('backgroundFile').files[0];
    const button = $('saveAppearance'); button.disabled = true;
    try {
      let backgroundValue = type === 'url' ? $('backgroundUrl').value.trim() : (type === 'gradient' ? '' : (adminState.settings.background_value || ''));
      if (type === 'upload' && file) {
        const form = new FormData(); form.append('file', file);
        const upload = await api('/api/admin/upload/background', { method: 'POST', body: form });
        backgroundValue = upload.path;
      } else if (type === 'upload' && !(adminState.settings.background_type === 'upload' && /^https?:\/\//i.test(String(adminState.settings.background_value || '')))) {
        throw new Error('Escolha uma imagem do computador para usar como plano de fundo.');
      }
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
        site_title: $('settingTitle').value, site_subtitle: $('settingSubtitle').value, theme,
        background_type: type, background_value: backgroundValue, allow_join: $('allowJoin').checked
      }) });
      $('backgroundFile').value = ''; $('backgroundUploadName').textContent = 'JPG, PNG ou WEBP · até 12 MB';
      await refresh(); message('A aparência do site foi atualizada! ✨');
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });

  function updateLinkIconMode() {
    const imageMode = $('linkIconType').value === 'image';
    $('linkIconEmojiWrap').hidden = imageMode;
    $('linkIconImageWrap').hidden = !imageMode;
  }
  function resetLinkForm() {
    $('linkForm').reset(); $('editingLinkId').value = ''; $('linkIcon').value = '💗'; $('linkColor').value = '#f3a6c8';
    $('linkIconType').value = 'emoji'; $('linkIconFile').value = ''; $('linkIconFileName').textContent = 'PNG, JPG ou WEBP · até 3 MB'; $('linkExistingIconUrl').value = '';
    updateLinkIconMode();
    $('linkFormTitle').textContent = 'Adicionar novo link'; $('saveLinkButton').innerHTML = 'Adicionar link <span>+</span>'; $('cancelLinkEdit').hidden = true;
  }
  function editLink(link) {
    setTab('links');
    $('editingLinkId').value = String(link.id); $('linkLabel').value = link.label; $('linkUrl').value = link.url;
    $('linkIconType').value = link.icon_type || 'emoji'; $('linkIcon').value = link.icon || '💗'; $('linkColor').value = link.color || '#f3a6c8';
    $('linkExistingIconUrl').value = link.icon_image_url || '';
    $('linkIconFile').value = '';
    $('linkIconFileName').textContent = link.icon_image_url ? 'Imagem atual salva · escolha outra para substituir' : 'PNG, JPG ou WEBP · até 3 MB';
    updateLinkIconMode();
    $('linkFormTitle').textContent = 'Editar link'; $('saveLinkButton').innerHTML = 'Salvar link <span>♡</span>'; $('cancelLinkEdit').hidden = false;
    $('linkLabel').focus();
  }
  $('linkIconType').addEventListener('change', updateLinkIconMode);
  $('linkIconFile').addEventListener('change', () => { $('linkIconFileName').textContent = $('linkIconFile').files[0]?.name || 'PNG, JPG ou WEBP · até 3 MB'; });
  $('cancelLinkEdit').addEventListener('click', resetLinkForm);
  $('linkForm').addEventListener('submit', async event => {
    event.preventDefault();
    const id = $('editingLinkId').value;
    const iconType = $('linkIconType').value;
    let iconImageUrl = null;
    if (iconType === 'image') {
      const file = $('linkIconFile').files[0];
      if (file) {
        const form = new FormData(); form.append('file', file);
        try { const upload = await api('/api/admin/upload/link-icon', { method: 'POST', body: form }); iconImageUrl = upload.path; }
        catch (error) { message(error.message, true); return; }
      } else iconImageUrl = $('linkExistingIconUrl').value || null;
      if (!iconImageUrl) { message('Escolha uma imagem para o ícone.', true); return; }
    }
    const payload = {
      label: $('linkLabel').value.trim(), url: $('linkUrl').value.trim(),
      icon: iconType === 'emoji' ? ($('linkIcon').value.trim() || '💗') : '💗',
      icon_type: iconType, icon_image_url: iconImageUrl, color: $('linkColor').value
    };
    try {
      await api(id ? `/api/admin/links/${id}` : '/api/admin/links', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      resetLinkForm(); await refresh(); message(id ? 'Link atualizado!' : 'Link adicionado ao site!');
    } catch (error) { message(error.message, true); }
  });

  $('musicFile').addEventListener('change', () => { $('musicUploadName').textContent = $('musicFile').files[0]?.name || 'MP3, OGG, WAV ou M4A · até 30 MB'; });
  $('saveMusic').addEventListener('click', async () => {
    const file = $('musicFile').files[0];
    const button = $('saveMusic'); button.disabled = true;
    try {
      if (file) {
        const form = new FormData(); form.append('file', file);
        await api('/api/admin/upload/music', { method: 'POST', body: form });
      }
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ music_enabled: $('musicEnabled').checked }) });
      $('musicFile').value = ''; $('musicUploadName').textContent = 'MP3, OGG, WAV ou M4A · até 30 MB';
      await refresh(); message('Configuração de música salva! ♫');
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  $('removeMusic').addEventListener('click', async () => {
    if (!confirm('Remover a música atual do site?')) return;
    try { await api('/api/admin/upload/music', { method: 'DELETE' }); await refresh(); message('Música removida.'); }
    catch (error) { message(error.message, true); }
  });

  $('userForm').addEventListener('submit', async event => {
    event.preventDefault();
    const payload = { email: $('newUsername').value.trim().toLowerCase(), role: $('newUserRole').value };
    try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }); $('userForm').reset(); await refresh(); message('Permissão concedida para essa conta.'); }
    catch (error) { message(error.message, true); }
  });

  $('usernameForm').addEventListener('submit', async event => {
    event.preventDefault();
    const username = $('profileUsername').value.trim();
    try {
      const data = await api('/api/admin/profile/username', { method: 'PUT', body: JSON.stringify({ username }) });
      adminState.user.username = data.username;
      $('sidebarUsername').textContent = data.username;
      $('welcomeUser').textContent = data.username.toUpperCase();
      message('Nome de usuário atualizado.');
    } catch (error) { message(error.message, true); }
  });

  $('passwordForm').addEventListener('submit', async event => {
    event.preventDefault();
    const current = $('currentPassword').value;
    const next = $('newPassword').value;
    if (next !== $('confirmPassword').value) { message('A confirmação da nova senha não confere.', true); return; }
    try { await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) }); $('passwordForm').reset(); message('Senha alterada com sucesso.'); }
    catch (error) { message(error.message, true); }
  });

  sbRealtimeSubscription();

  function sbRealtimeSubscription() {
    const sb = window.roletaSupabase;
    sb.channel('roleta-cute-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => refresh().catch(() => {}))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => refresh().catch(() => {}))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, () => refresh().catch(() => {}))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refresh().catch(() => {}))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draws' }, () => refreshHistoryOnly().catch(() => {}))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draw_events' }, payload => {
        const event = payload.new?.payload || {};
        if (payload.new?.event_type === 'draw_started') {
          currentWinners = event.winners || [];
          renderWinners();
          animateAdminWinners(event.winners || [], false, event.participants || []);
        }
        if (payload.new?.event_type === 'draw_replacement') {
          currentWinners = currentWinners.map(item => item.id === event.oldDrawId ? event.winner : item);
          renderWinners();
          animateAdminWinners([event.winner].filter(Boolean), true, event.participants || []);
        }
        if (payload.new?.event_type === 'draw_reset') {
          currentWinners = [];
          renderWinners();
          $('drawStatus').textContent = event.clearParticipants
            ? 'Sorteio recriado e lista de participantes limpa.'
            : 'Sorteio recriado. Participantes mantidos.';
          refresh().catch(() => {});
        }
      })
      .subscribe();
  }

  async function init() {
    try { await refresh(); setTab('overview'); }
    catch (error) { if (error.message === 'Faça login para continuar.') { window.location.href = './login.html'; return; } message(error.message, true); }
  }
  init();
})();
