window.onload = function () {
	window.addEventListener('scroll', function (e) {
		if (window.pageYOffset > 100) {
			document.querySelector("notheader").classList.add('is-scrolling');
		} else {
			document.querySelector("notheader").classList.remove('is-scrolling');
		}
	});

	const menu_btn = document.querySelector('.hamburger');
	const mobile_menu = document.querySelector('.mobile-nav');

	menu_btn.addEventListener('click', function () {
		menu_btn.classList.toggle('is-active');
		mobile_menu.classList.toggle('is-active');
	});
}

  document.addEventListener('DOMContentLoaded', () => {
    const elementos = document.querySelectorAll('.texto');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('mostrar');
          observer.unobserve(entry.target); // Se ejecuta una sola vez
        }
      });
    }, {
      threshold: 0.3 // Se activa cuando el 30% del elemento está visible
    });

    elementos.forEach(el => observer.observe(el));
  });

function vivo() {
	window.open('https://01.solumedia.com.ar/AudioPlayer/nohablespormi?mount', 'RADIO EN VIVO' , 'width=315px height=500px'); 
}

