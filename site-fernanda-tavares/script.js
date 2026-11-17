// =========================================================
// CONFIGURAÇÃO — edite aqui os contatos reais da Fernanda.
// Todos os botões de WhatsApp/Instagram do site usam estes dados.
// =========================================================
const CONFIG = {
  // Número com DDI + DDD, só dígitos. Ex.: 5531987654321
  whatsapp: "5531900000000",
  mensagemTutor: "Olá, Dra. Fernanda! Vim pelo site e gostaria de agendar uma consulta.",
  mensagemVeterinario: "Olá, Dra. Fernanda! Sou médico(a) veterinário(a) e gostaria de encaminhar/discutir um caso.",
  instagram: "https://www.instagram.com/SEU_INSTAGRAM",
};

(function () {
  const wa = (msg) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
  document.querySelectorAll(".js-whatsapp").forEach((a) => (a.href = wa(CONFIG.mensagemTutor)));
  document.querySelectorAll(".js-whatsapp-vet").forEach((a) => (a.href = wa(CONFIG.mensagemVeterinario)));
  document.querySelectorAll(".js-instagram").forEach((a) => (a.href = CONFIG.instagram));

  // Ano no rodapé
  const ano = document.getElementById("ano");
  if (ano) ano.textContent = new Date().getFullYear();

  // Menu mobile
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("menu");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
    nav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  // Animação de entrada das seções
  if ("IntersectionObserver" in window) {
    const els = document.querySelectorAll(".section-head, .card, .signs li, .steps li, .glands, .about > *, .faq details");
    els.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
      }),
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
  }
})();
