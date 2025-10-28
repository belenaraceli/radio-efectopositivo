
  const lightbox = GLightbox({
    selector: '.glightbox'
  });


  document.getElementById('verMasBtn').addEventListener('click', function () {
    document.querySelectorAll('.hidden-img').forEach(img => {
      img.style.display = 'block';
    });
    this.style.display = 'none';
  });



  const verMasBtn = document.getElementById('verMasBtn');
  const imagenesOcultas = document.querySelectorAll('.hidden-img');

  verMasBtn.addEventListener('click', () => {
  imagenesOcultas.forEach(img => img.classList.add('visible'));
  verMasBtn.setAttribute('aria-expanded','true');
  verMasBtn.style.display = 'none';
});

// Mostrar solo los primeros 10 items al cargar y marcar el resto como hidden
(function(){
  const grid = document.querySelector('.galeria-grid');
  if (!grid) return;
  const items = Array.from(grid.children); // asumimos que cada child es <a>...</a> o figure
  const VISIBLE = 8;
  items.forEach((it, i) => {
    if (i >= VISIBLE) {
      it.classList.add('hidden-img'); // oculta con CSS
    } else {
      it.classList.remove('hidden-img');
    }
  });

  // Si tenés un botón "Ver más" con id verMasBtn, habilitarlo:
  const verMasBtn = document.getElementById('verMasBtn') || document.querySelector('.ver-mas-btn');
  if (verMasBtn) {
    verMasBtn.style.display = items.length > VISIBLE ? 'inline-block' : 'none';
    verMasBtn.addEventListener('click', () => {
      items.forEach(it => it.classList.remove('hidden-img'));
      verMasBtn.style.display = 'none';
    });
  }
})();
