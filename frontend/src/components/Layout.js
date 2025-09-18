import React from 'react';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

const Layout = ({ children }) => {

  return (
    <div className="min-h-screen bg-gray-900">
      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-2">
            <ShieldCheckIcon className="h-10 w-10 text-tyler-blue mr-3" />
            <span className="text-3xl font-bold text-white">Tyler</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
};

export default Layout;