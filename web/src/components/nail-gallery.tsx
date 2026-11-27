"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const designs = [
  { file: "set-01.jpg", alt: "Blush pink almond nails with crisp white tips and delicate gold details", style: "gallery-item-tall", label: "Pink & pearl" },
  { file: "set-02.jpg", alt: "Pink and olive-green nail art with fine gold accents", style: "gallery-item-wide", label: "Olive glow" },
  { file: "set-03.jpg", alt: "Short rose-pink nails with softly detailed French tips", style: "", label: "Rose French" },
  { file: "set-04.jpg", alt: "Glossy pink nails with white and gold floral details", style: "gallery-item-tall", label: "Petal tips" },
  { file: "set-05.jpg", alt: "Pink and green statement nails with gold embellishments", style: "", label: "Golden hour" },
  { file: "set-06.jpg", alt: "Blush square nails with playful black dotted French tips", style: "gallery-item-wide", label: "Dotty darling" },
  { file: "set-07.jpg", alt: "Nude pink nails with elegant black and white dotted tips", style: "gallery-item-tall", label: "Dotted details" },
  { file: "set-08.jpg", alt: "Glossy mauve nails with delicate diagonal line art", style: "", label: "Mauve mood" },
  { file: "set-09.jpg", alt: "Nail art featuring pink, white, and burgundy floral details", style: "", label: "Blooming pretty" },
  { file: "set-10.jpg", alt: "Soft nude pedicure with sculpted white daisies and dark polish", style: "gallery-item-tall", label: "Daisy toes" },
  { file: "set-11.jpg", alt: "Soft pink almond manicure with elegant white French tips", style: "", label: "Classic French" },
  { file: "set-12.jpg", alt: "Natural pink nails finished with delicate white swoop details", style: "gallery-item-wide", label: "Soft swirls" },
  { file: "set-13.jpg", alt: "Long glossy red stiletto nails", style: "gallery-item-tall", label: "Cherry red" },
  { file: "set-14.jpg", alt: "Bright red stiletto nails with a smooth, glossy finish", style: "", label: "Red hot" },
  { file: "set-15.jpg", alt: "Long blush nails decorated with tiny cherry details", style: "gallery-item-wide", label: "Cherry sweet" },
  { file: "set-16.jpg", alt: "Pink nails with white and fuchsia floral accents", style: "", label: "Pretty petals" },
  { file: "set-17.jpg", alt: "Pink and white stiletto nails with delicate floral art and crystals", style: "gallery-item-tall", label: "Petal sparkle" },
  { file: "set-18.jpg", alt: "Glossy pink nails with white tips, pink line art, and tiny gems", style: "", label: "Blush sparkle" },
];

export default function NailGallery() {
  const [selected, setSelected] = useState<(typeof designs)[number] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      <div className="nail-gallery">
        {designs.map((design, index) => (
          <button
            className={`nail-gallery-card ${design.style}`}
            key={design.file}
            type="button"
            onClick={() => setSelected(design)}
            aria-label={`View ${design.label} nail design`}
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
          >
            <Image
              src={`/gallery/${design.file}`}
              alt={design.alt}
              fill
              sizes="(max-width: 680px) 46vw, (max-width: 1000px) 30vw, 22vw"
              loading="lazy"
            />
            <span className="gallery-card-caption">{design.label}<span aria-hidden="true">↗</span></span>
          </button>
        ))}
      </div>
      <dialog
        className="gallery-lightbox"
        ref={dialogRef}
        aria-label="Nail design photo"
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        {selected && (
          <div className="lightbox-content">
            <button className="lightbox-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close photo">×</button>
            <Image src={`/gallery/${selected.file}`} alt={selected.alt} width={900} height={1200} sizes="(max-width: 760px) 90vw, 650px" />
            <p>{selected.label}</p>
          </div>
        )}
      </dialog>
    </>
  );
}
