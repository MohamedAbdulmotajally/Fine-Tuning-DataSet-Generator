
import React from 'react';
import { CogIcon } from './icons/Icons';

interface LoaderProps {
  message: string;
}

const Loader: React.FC<LoaderProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <CogIcon className="w-16 h-16 text-primary animate-spin" />
      <h2 className="mt-6 text-2xl font-semibold text-text-primary">Processing...</h2>
      <p className="mt-2 text-text-secondary">{message}</p>
    </div>
  );
};

export default Loader;
