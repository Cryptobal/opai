import MarketingNav from "@/components/marketing/MarketingNav";
import HeroSection from "@/components/marketing/HeroSection";
import ProblemSection from "@/components/marketing/ProblemSection";
import ModulesSection from "@/components/marketing/ModulesSection";
import PortalsSection from "@/components/marketing/PortalsSection";
import AddOnsSection from "@/components/marketing/AddOnsSection";
import PricingSection from "@/components/marketing/PricingSection";
import TestimonialsSection from "@/components/marketing/TestimonialsSection";
import FaqSection from "@/components/marketing/FaqSection";
import CtaSection from "@/components/marketing/CtaSection";
import LoginGate from "@/components/marketing/LoginGate";
import MarketingFooter from "@/components/marketing/MarketingFooter";

// Static JSON-LD structured data for SEO (all hardcoded, no user input)
const JSON_LD_CONTENT = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OPAI",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "ERP para empresas de seguridad privada en Chile. Gestión de guardias, rondas GPS, marcaciones, payroll y portal del cliente.",
      url: "https://opai.cl",
      offers: [
        {
          "@type": "Offer",
          name: "Starter",
          price: "0.12",
          priceCurrency: "CLF",
          description: "Por guardia activo/mes",
        },
        {
          "@type": "Offer",
          name: "Operaciones Pro",
          price: "0.28",
          priceCurrency: "CLF",
          description: "Por guardia activo/mes",
        },
        {
          "@type": "Offer",
          name: "Suite Completa",
          price: "0.46",
          priceCurrency: "CLF",
          description: "Por guardia activo/mes",
        },
      ],
      featureList: [
        "Gestión de guardias de seguridad",
        "Control de rondas GPS",
        "Marcaciones con geolocalización",
        "Payroll Chile LRE",
        "Portal del cliente",
        "Portal del guardia",
        "Facturación electrónica SII",
        "Inteligencia artificial",
      ],
      availableOnDevice: ["Desktop", "Mobile"],
    },
    {
      "@type": "Organization",
      name: "OPAI",
      url: "https://opai.cl",
      logo: "https://opai.cl/brand/opai/svg/logo-horizontal.svg",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Santiago",
        addressCountry: "CL",
      },
      contactPoint: {
        "@type": "ContactPoint",
        email: "hola@opai.cl",
        contactType: "sales",
        availableLanguage: "Spanish",
      },
    },
  ],
});

export default function MarketingPage() {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- Static JSON-LD, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON_LD_CONTENT }}
      />
      <MarketingNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <ModulesSection />
        <PortalsSection />
        <AddOnsSection />
        <PricingSection />
        <TestimonialsSection />
        <FaqSection />
        <CtaSection />
        <LoginGate />
      </main>
      <MarketingFooter />
    </>
  );
}
