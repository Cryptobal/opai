"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  // NOTA: las clases `opai-ios-surface-sheet-*` sólo tienen efecto visual
  // en mobile < lg (Liquid Glass). En desktop permanecen con el
  // `bg-background` de la variante surface="default".
  // `bg-background` vive en surface.default (no en la base) para que
  // surface="glass-island" no arrastre un fondo opaco bajo el vidrio.
  "fixed z-50 gap-4 p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top opai-ios-surface-sheet-top",
        bottom:
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm opai-ios-surface-sheet-side",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm opai-ios-surface-sheet-side",
      },
      surface: {
        default: "bg-background",
        "glass-island": "opai-glass-sheet-island",
      },
    },
    compoundVariants: [
      {
        side: "bottom",
        surface: "default",
        class: "inset-x-0 bottom-0 border-t opai-ios-surface-sheet-bottom",
      },
      {
        side: "bottom",
        surface: "glass-island",
        class: "left-[10px] right-[10px] rounded-[26px]",
      },
    ],
    defaultVariants: {
      side: "right",
      surface: "default",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  overlayClassName?: string
  showCloseButton?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side = "right",
      surface = "default",
      className,
      children,
      style,
      overlayClassName,
      showCloseButton = true,
      ...props
    },
    ref
  ) => {
  // Sólo para Sheets que pegan al fondo (mobile-first) hay que ajustar el
  // posicionamiento cuando se abre el teclado virtual. Otros lados (top/
  // left/right) no se ven afectados visualmente por el teclado.
  const keyboardOffset = useKeyboardOffset();
  const isBottomSheet = side === "bottom";
  const isGlassIsland = surface === "glass-island";
  const keyboardStyle: React.CSSProperties | undefined = (() => {
    if (!isBottomSheet) return undefined;
    if (isGlassIsland) {
      if (keyboardOffset > 0) {
        return {
          bottom: `${keyboardOffset + 10}px`,
          maxHeight: `calc(100dvh - ${keyboardOffset + 10}px)`,
          scrollPaddingBottom: `${keyboardOffset + 20}px`,
        };
      }
      return {
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        scrollPaddingBottom: "20px",
      };
    }
    if (keyboardOffset > 0) {
      return {
        bottom: `${keyboardOffset}px`,
        maxHeight: `calc(100dvh - ${keyboardOffset}px)`,
        scrollPaddingBottom: `${keyboardOffset + 20}px`,
      };
    }
    return { scrollPaddingBottom: "20px" };
  })();

  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side, surface }), className)}
        style={{ ...keyboardStyle, ...style }}
        {...props}
      >
        {children}
        {showCloseButton !== false && (
          <SheetPrimitive.Close
            className="absolute right-2 sm:right-4 inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border/40 opacity-90 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
            style={{ top: "max(env(safe-area-inset-top, 0px), 0.75rem)" }}
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="sr-only">Cerrar</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
