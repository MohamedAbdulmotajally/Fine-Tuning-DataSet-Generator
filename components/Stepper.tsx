import React from 'react';
import { AppStep } from '../types';
import { UploadCloudIcon, DownloadIcon } from './icons/Icons';

interface StepperProps {
  currentStep: AppStep;
}

const steps = [
  { id: AppStep.Upload, name: 'Upload Pairs', icon: <UploadCloudIcon className="w-6 h-6" /> },
  { id: AppStep.Download, name: 'Generate & Download', icon: <DownloadIcon className="w-6 h-6" /> },
];

const Stepper: React.FC<StepperProps> = ({ currentStep }) => {
  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center justify-center">
        {steps.map((step, stepIdx) => (
          <li key={step.name} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
            {stepIdx < currentStepIndex ? (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-primary" />
                </div>
                <div
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary hover:bg-blue-700"
                >
                  {step.icon}
                </div>
              </>
            ) : stepIdx === currentStepIndex ? (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-border" />
                </div>
                <div
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary bg-card"
                  aria-current="step"
                >
                  <span className="text-primary">{step.icon}</span>
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-border" />
                </div>
                <div
                  className="group relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-border bg-card hover:border-gray-400"
                >
                  <span className="text-gray-500 group-hover:text-gray-300">{step.icon}</span>
                </div>
              </>
            )}
            <div className="absolute -bottom-8 w-max text-center -translate-x-1/2 left-1/2">
                <span className={`text-sm font-medium ${stepIdx <= currentStepIndex ? 'text-text-primary' : 'text-text-secondary'}`}>{step.name}</span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Stepper;