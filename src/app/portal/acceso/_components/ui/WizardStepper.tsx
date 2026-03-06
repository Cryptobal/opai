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
              {/* Step circle + label */}
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={`
                    flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold
                    transition-all duration-300
                    ${isCompleted ? "bg-green-500 text-white" : ""}
                    ${isActive ? "bg-cyan-500 text-white ring-2 ring-cyan-500/40 ring-offset-2 ring-offset-gray-900" : ""}
                    ${isUpcoming ? "bg-gray-700 text-gray-400 border border-gray-600" : ""}
                  `}
                >
                  {isCompleted ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`
                    mt-1.5 text-[10px] font-medium text-center max-w-[72px] leading-tight
                    ${isCompleted ? "text-green-400" : ""}
                    ${isActive ? "text-cyan-400" : ""}
                    ${isUpcoming ? "text-gray-500" : ""}
                  `}
                >
                  {step}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="flex-1 mx-1 self-start mt-4">
                  <div
                    className={`
                      h-0.5 w-full transition-all duration-300
                      ${index < currentStep ? "bg-green-500" : "bg-gray-700"}
                    `}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
