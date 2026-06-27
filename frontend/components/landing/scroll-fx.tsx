"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function ScrollFx({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scope = root.current;
      if (!scope) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const reveals = gsap.utils.toArray<HTMLElement>(
          scope.querySelectorAll("[data-reveal]"),
        );
        gsap.set(reveals, { opacity: 0, y: 24 });
        ScrollTrigger.batch(reveals, {
          start: "top 86%",
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.7,
              ease: "power2.out",
              stagger: 0.1,
              overwrite: true,
            }),
        });

        gsap.utils
          .toArray<HTMLElement>(scope.querySelectorAll("[data-parallax]"))
          .forEach((el) => {
            gsap.to(el, {
              yPercent: 16,
              ease: "none",
              scrollTrigger: {
                trigger: el,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            });
          });

        ScrollTrigger.refresh();
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="contents">
      {children}
    </div>
  );
}
