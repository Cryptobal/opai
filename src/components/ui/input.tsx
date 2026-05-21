import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoComplete, inputMode, ...props }, ref) => {
    // Default `autoComplete="off"` para evitar la barra de autorrelleno
    // de contacto en iOS (la que dice "Autorrellenar contacto" arriba
    // del teclado y reflowea el layout). Sigue overrideable via prop
    // si el caller necesita un valor específico (email, tel, etc).
    const finalAutoComplete = autoComplete ?? "off";
    // Para inputs numéricos seteamos `inputMode="decimal"` por default
    // así iOS muestra el teclado numérico (sin sugerencias de contacto).
    const finalInputMode =
      inputMode ?? (type === "number" ? "decimal" : undefined);
    return (
      <input
        type={type}
        autoComplete={finalAutoComplete}
        inputMode={finalInputMode}
        className={cn(
          // En mobile usamos text-base (16px) para evitar el zoom automático
          // que aplica iOS Safari al enfocar inputs con font-size < 16px.
          // Ese zoom + Sheet/Dialog fijos al fondo causaba el bug de "el
          // texto desaparece al escribir" (en realidad el input quedaba
          // fuera del viewport visible). En sm+ volvemos a text-sm porque
          // no hay teclado virtual y los UIs son más compactos.
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-0 text-base sm:text-sm leading-tight text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
