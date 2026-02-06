'use client';

/**
 * ScrollProgress - Barra de progreso superior
 * Muestra el avance en la presentación
 */

import { useState, useEffect } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

export function ScrollProgress() {
  const [isMounted, setIsMounted] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  if (!isMounted) return null;
  
  return (
    <>
      {/* Progress bar background */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-white/10 z-[100]" />
      
      {/* Progress bar fill */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500 origin-left z-[100] shadow-lg shadow-teal-500/50"
        style={{ scaleX }}
      />
    </>
  );
}
