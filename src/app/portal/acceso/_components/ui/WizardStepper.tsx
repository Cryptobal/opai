"use client";

import React from "react";

interface WizardStepperProps {
  steps: string[];
  currentStep: number;
}

export default function WizardStepper({ steps, currentStep }: WizardStepperProps) {
  return (
    <div className="w-full px-2 py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <React.Fragment key={index}>
              <div className="relative z-10 flex flex-col items-center">
                <div
                  className={`
                    flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold
                    ${isCompleted ? "bg-status-ok text-white" : ""}
                    ${isActive ? "bg-primary text-primary-foreground ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}
                    ${isUpcoming ? "border border-ds-border-default bg-ds-surface-2 text-ds-text-3" : ""}
                  `}
                >
                  {isCompleted ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-1.5 max-w-[72px] text-center text-[12px] font-medium leading-tight
                    ${isCompleted ? "text-status-ok-fg" : ""}
                    ${isActive ? "text-primary" : ""}
                    ${isUpcoming ? "text-ds-text-3" : ""}
                  `}
                >
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className="mx-1 mt-5 flex-1 self-start">
                  <div className={`h-0.5 w-full ${index < currentStep ? "bg-status-ok" : "bg-ds-border-default"}`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
