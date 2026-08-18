import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ItemTooltip } from './ItemTooltip';
import { calculateTooltipPosition } from '../utils/tooltipPosition';

export function TooltipTrigger({ item, comparisonItems, children, ...props }) {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e) => {
    setActive(true);
    setPos({ x: e.clientX, y: e.clientY });
    props.onMouseEnter?.(e);
  };

  const handleMouseMove = (e) => {
    if (active) {
      setPos({ x: e.clientX, y: e.clientY });
    }
    props.onMouseMove?.(e);
  };

  const handleMouseLeave = (e) => {
    setActive(false);
    props.onMouseLeave?.(e);
  };

  return (
    <div
      {...props}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {children}
      {active && item && (
        <PortalTooltip item={item} comparisonItems={comparisonItems} pos={pos} />
      )}
    </div>
  );
}

function PortalTooltip({ item, comparisonItems, pos }) {
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const result = calculateTooltipPosition({
      clientX: pos.x,
      clientY: pos.y,
      tooltipRect: rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    
    tooltipRef.current.style.left = result.left + 'px';
    tooltipRef.current.style.top = result.top + 'px';
    tooltipRef.current.style.maxHeight = result.maxHeight + 'px';
    tooltipRef.current.style.visibility = 'visible';
    tooltipRef.current.style.overflowY = 'auto';
  }, [pos.x, pos.y, item]);

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        zIndex: 99999,
        pointerEvents: 'none',
        visibility: 'hidden',
        left: '-9999px',
        top: '-9999px'
      }}
    >
      <ItemTooltip item={item} comparisonItems={comparisonItems} />
    </div>,
    document.body
  );
}
