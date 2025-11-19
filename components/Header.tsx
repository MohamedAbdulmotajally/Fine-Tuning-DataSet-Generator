import React from 'react';
import { SparklesIcon } from './icons/Icons';

const Header: React.FC = () => {
  return (
    <header className="text-center mb-12">
      <div className="flex justify-center items-center gap-4">
        <SparklesIcon className="w-10 h-10 text-primary" />
        <h1 className="text-4xl md:text-5xl font-extrabold text-text-primary">
          Fine-Tuning Dataset Generator
        </h1>
      </div>
      <p className="mt-4 text-lg text-text-secondary max-w-3xl mx-auto">
        Create a JSONL dataset from your RFPs and Proposals to fine-tune your own generative AI model.
      </p>
    </header>
  );
};

export default Header;