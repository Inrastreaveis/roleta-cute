(function () {
  const COLORS = [
    '#f7bfd6', '#d9c9f3', '#f9d8b7', '#c5e8d9', '#f5c9c8',
    '#c9dff4', '#f4dfaa', '#e8c8e8', '#bfe5e8', '#f4c7df'
  ];
  const TAU = Math.PI * 2;

  function draw(canvas, participants) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = Math.min(canvas.width, canvas.height);
    const center = size / 2;
    const radius = size * 0.465;
    const people = Array.isArray(participants) ? participants : [];

    ctx.clearRect(0, 0, canvas.width, canvas.height);


    ctx.beginPath();
    ctx.arc(center, center, radius + 9, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();

    if (!people.length) {
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, TAU);
      ctx.fillStyle = '#ffeaf3';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.fillStyle = '#b987a2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 34px Nunito, sans-serif';
      ctx.fillText('Aguardando', center, center - 15);
      ctx.font = '700 25px Nunito, sans-serif';
      ctx.fillText('participantes ♡', center, center + 27);
      return;
    }

    const slice = TAU / people.length;
    const startBase = -Math.PI / 2;

    people.forEach((person, index) => {
      const start = startBase + index * slice;
      const end = start + slice;
      const middle = start + slice / 2;


      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[index % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.98)';
      ctx.lineWidth = people.length > 70 ? 2 : 4;
      ctx.stroke();

      let label = String(person && person.name ? person.name : 'Participante');
      if (people.length === 1) {
        ctx.save();
        ctx.fillStyle = '#65475b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 25px Nunito, sans-serif';
        ctx.fillText(label, center, center - radius * 0.55, radius * 0.55);
        ctx.restore();
        return;
      }


      const labelRadius = radius * 0.68;
      const sliceThickness = labelRadius * slice;
      const fontSize = Math.max(5, Math.min(25, sliceThickness * 0.085));
      const maxRadialTextWidth = radius * 0.30;

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(middle);
      ctx.translate(labelRadius, 0);
      if (Math.cos(middle) < 0) ctx.rotate(Math.PI);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#65475b';
      ctx.shadowColor = 'rgba(255,255,255,.45)';
      ctx.shadowBlur = 2;
      ctx.font = `900 ${fontSize}px Nunito, sans-serif`;


      ctx.fillText(label, 0, 0, maxRadialTextWidth);
      ctx.restore();
    });


    ctx.beginPath();
    ctx.arc(center, center, radius, 0, TAU);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.stroke();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  async function spinToWinner(canvas, participants, winner, options = {}) {
    if (!canvas || !Array.isArray(participants) || !participants.length || !winner) return false;
    const index = participants.findIndex(person =>
      String(person.id) === String(winner.participant_id ?? winner.id)
    );
    if (index < 0) return false;

    const duration = Number(options.duration || 5200);
    const turns = Number(options.turns || 6);
    const sliceDegrees = 360 / participants.length;
    const centerDegrees = -90 + (index + 0.5) * sliceDegrees;
    const current = Number(canvas._rotation || 0);
    const delta = mod(-90 - centerDegrees - current, 360) + 360 * turns;
    const target = current + delta;

    canvas.style.transition = `transform ${duration}ms cubic-bezier(.10,.72,.12,1)`;
    void canvas.offsetWidth;
    requestAnimationFrame(() => {
      canvas.style.transform = `rotate(${target}deg)`;
    });
    await wait(duration + 100);
    canvas._rotation = target;
    return true;
  }

  window.CuteWheel = { draw, spinToWinner };
})();
