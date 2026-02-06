'use client';

/**
 * PhotoMosaic - Grid de fotos para mostrar equipo y operaciones
 * Usado en sección S16 (Nuestra Gente) y otras
 */

import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface PhotoMosaicProps {
  photos: string[];
  className?: string;
  columns?: 2 | 3 | 4 | 5;
  aspectRatio?: 'square' | 'portrait' | 'landscape';
}

export function PhotoMosaic({ 
  photos, 
  className,
  columns = 3,
  aspectRatio = 'square'
}: PhotoMosaicProps) {
  const theme = useThemeClasses();
  
  const gridClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
  };
  
  const aspectClasses = {
    square: 'aspect-square',
    portrait: 'aspect-[3/4]',
    landscape: 'aspect-[4/3]',
  };
  
  return (
    <div className={cn(
      'grid gap-4',
      gridClasses[columns],
      className
    )}>
      {photos.map((photo, index) => (
        <div
          key={index}
          className={cn(
            'relative rounded-lg overflow-hidden border',
            theme.border,
            aspectClasses[aspectRatio],
            'group cursor-pointer'
          )}
        >
          <Image
            src={photo}
            alt={`Foto ${index + 1}`}
            fill
            className="object-cover transition-transform group-hover:scale-110"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          />
          
          {/* Overlay on hover */}
          <div className={cn(
            'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity',
            'bg-gradient-to-t from-black/70 to-transparent'
          )} />
        </div>
      ))}
    </div>
  );
}

/**
 * Hero Mosaic - Layout especial para hero sections
 */
export function HeroPhotoMosaic({ photos, className }: { photos: string[]; className?: string }) {
  const theme = useThemeClasses();
  
  if (photos.length < 4) {
    return <PhotoMosaic photos={photos} className={className} />;
  }
  
  // Layout especial: 1 grande + 3 pequeñas
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 gap-4', className)}>
      {/* Foto principal grande */}
      <div className={cn(
        'relative rounded-lg overflow-hidden border col-span-2 row-span-2',
        theme.border,
        'aspect-square md:aspect-[4/3]'
      )}>
        <Image
          src={photos[0]}
          alt="Foto principal"
          fill
          className="object-cover"
          priority
          sizes="(max-width: 768px) 100vw, 66vw"
        />
      </div>
      
      {/* Fotos secundarias */}
      {photos.slice(1, 4).map((photo, index) => (
        <div
          key={index}
          className={cn(
            'relative rounded-lg overflow-hidden border',
            theme.border,
            'aspect-square'
          )}
        >
          <Image
            src={photo}
            alt={`Foto ${index + 2}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 33vw"
          />
        </div>
      ))}
    </div>
  );
}
