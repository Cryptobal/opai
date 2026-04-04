import Image from "next/image";

const FOOTER_LINKS = {
  Plataforma: [
    { label: "Módulos", href: "#modulos" },
    { label: "Portales", href: "#portales" },
    { label: "Precios", href: "#precios" },
    { label: "Add-ons", href: "#addons" },
  ],
  Recursos: [
    { label: "FAQ", href: "#faq" },
    { label: "Documentación", href: "#" },
    { label: "Guía LRE 2025", href: "#" },
    { label: "API", href: "#" },
  ],
  Empresa: [
    { label: "Nosotros", href: "#" },
    { label: "Contacto", href: "mailto:hola@opai.cl" },
    { label: "Partners", href: "#" },
  ],
};

export default function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#06080F]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Image
              src="/brand/opai/svg/logo-horizontal.svg"
              alt="OPAI"
              width={80}
              height={26}
              className="h-6 w-auto mb-4"
            />
            <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
              El único ERP diseñado para la seguridad privada, no adaptado para ella.
            </p>
            <p className="text-xs text-[#94A3B8]">Hecho en Chile 🇨🇱</p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-[#94A3B8] hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/[0.07] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#94A3B8]">
            &copy; {new Date().getFullYear()} OPAI. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6 text-xs text-[#94A3B8]">
            <a href="#" className="hover:text-white transition-colors">Términos</a>
            <a href="#" className="hover:text-white transition-colors">Privacidad</a>
            <a href="mailto:hola@opai.cl" className="hover:text-white transition-colors">
              hola@opai.cl
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
