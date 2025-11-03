/* Minimal JS to power the carousel.
 - Soporta: prev/next, dots, autoplay, pause on hover/focus, swipe touch, lazy YouTube injection.
 - Personaliza las constantes abajo si querés.
*/
(function(){
  const root = document.currentScript ? document.currentScript.parentElement : document.querySelector('.ce-carousel');
  if (!root) return;
  const track = root.querySelector('.ce-carousel__track');
  const slides = Array.from(track.children);
  const prevBtn = root.querySelector('.ce-btn--prev');
  const nextBtn = root.querySelector('.ce-btn--next');
  const dotsWrap = root.querySelector('.ce-dots');
  const autoplayBtn = root.querySelector('.ce-autoplay-toggle');
  const AUTOPLAY_INTERVAL = 3000;

  let idx = 0;
  let autoplay = true;
  let autoplayTimer = null;
  let isDragging = false, startX = 0, currentTranslate = 0, prevTranslate = 0;

  // build dots
  slides.forEach((s, i) => {
    const d = document.createElement('button');
    d.className = 'ce-dot';
    d.setAttribute('aria-label','Ir al slide ' + (i+1));
    d.setAttribute('aria-pressed', i===0 ? 'true' : 'false');
    d.addEventListener('click', ()=> goTo(i));
    dotsWrap.appendChild(d);
  });

  const dots = Array.from(dotsWrap.children);

  function update(){
    const offset = -idx * slides[0].getBoundingClientRect().width;
    track.style.transform = `translateX(${offset}px)`;
    dots.forEach((d,i)=> d.setAttribute('aria-pressed', i===idx ? 'true' : 'false'));
    // pause any playing HTML5 video when moving
    slides.forEach((s, i) => {
      const video = s.querySelector('video');
      if (video && !video.paused && i !== idx) video.pause();
    });
  }

  function goTo(i){
    idx = (i + slides.length) % slides.length;
    update();
    resetAutoplay();
  }

  prevBtn.addEventListener('click', ()=> { goTo(idx-1); });
  nextBtn.addEventListener('click', ()=> { goTo(idx+1); });

  // autoplay
  function startAutoplay(){ stopAutoplay(); autoplay = true; autoplayTimer = setInterval(()=> goTo(idx+1), AUTOPLAY_INTERVAL); autoplayBtn.textContent = 'Pausar'; autoplayBtn.setAttribute('aria-pressed','false'); }
  function stopAutoplay(){ autoplay = false; if (autoplayTimer) clearInterval(autoplayTimer); autoplayTimer = null; autoplayBtn.textContent = 'Reproducir'; autoplayBtn.setAttribute('aria-pressed','true'); }
  function resetAutoplay(){ if (autoplay) { stopAutoplay(); startAutoplay(); } }

  autoplayBtn.addEventListener('click', ()=> {
    if (autoplayTimer) stopAutoplay(); else startAutoplay();
  });

  // pause on hover/focus for accessibility
  root.addEventListener('mouseenter', ()=> { if (autoplayTimer) clearInterval(autoplayTimer); });
  root.addEventListener('mouseleave', ()=> { if (autoplay) startAutoplay(); });

  // keyboard navigation
  root.addEventListener('keydown', (e)=> {
    if (e.key === 'ArrowLeft') goTo(idx-1);
    if (e.key === 'ArrowRight') goTo(idx+1);
  });

  // handle touch drag (basic)
  const viewport = root.querySelector('.ce-carousel__viewport');
  viewport.addEventListener('touchstart', touchStart, {passive:true});
  viewport.addEventListener('touchmove', touchMove, {passive:true});
  viewport.addEventListener('touchend', touchEnd);

  function touchStart(e){ isDragging = true; startX = e.touches[0].clientX; prevTranslate = -idx * slides[0].getBoundingClientRect().width; }
  function touchMove(e){
    if(!isDragging) return;
    const currentX = e.touches[0].clientX;
    const dx = currentX - startX;
    track.style.transition = 'none';
    track.style.transform = `translateX(${prevTranslate + dx}px)`;
  }
  function touchEnd(e){
    isDragging = false;
    track.style.transition = '';
    const endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : startX;
    const dx = endX - startX;
    const threshold = slides[0].getBoundingClientRect().width * 0.2;
    if (dx > threshold) goTo(idx-1);
    else if (dx < -threshold) goTo(idx+1);
    else update();
  }

  // lazy load YouTube: inject iframe when poster clicked
  slides.forEach((s, i) => {
    if (s.dataset.type === 'youtube') {
      const poster = s.querySelector('.ce-youtube-poster');
      poster.addEventListener('click', ()=> {
        const vid = s.dataset.youtubeId;
        if (!vid) return;
        const iframe = document.createElement('iframe');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
        iframe.setAttribute('allowfullscreen','');
        iframe.setAttribute('playsinline','');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(vid)}?rel=0&modestbranding=1&playsinline=1`;
        // replace poster with iframe
        s.innerHTML = '';
        s.appendChild(iframe);
      }, { once: true });
      // keyboard accessibility
      poster.addEventListener('keydown', (e)=> { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poster.click(); } });
    }
  });

  // start
  update();
  startAutoplay();

  // adapt on resize to recalc widths
  window.addEventListener('resize', ()=> { update(); });
})();

// init Plyr para todos los videos con clase .js-plyr
document.addEventListener('DOMContentLoaded', () => {
  const players = Array.from(document.querySelectorAll('.js-plyr')).map(v => new Plyr(v, {
    controls: ['play-large','play','progress','current-time','mute','volume','settings','fullscreen'],
    ratio: '16:9',
    invertTime: false
  }));
  // opcional: guardar players globalmente si necesitas controlarlos
  window._plyr = players;
});

