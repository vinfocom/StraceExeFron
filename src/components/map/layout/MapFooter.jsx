import React from 'react';
import { Play, Pause, Rewind, FastForward } from 'lucide-react';

const MapFooter = () => {
    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-20">
            <div className="bg-white/90 backdrop-blur-sm shadow-2xl rounded-xl p-3 border border-gray-200">
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <button className="p-2 hover:bg-gray-200 rounded-full"><Rewind className="h-5 w-5" /></button>
                        <button className="p-3 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700"><Play className="h-5 w-5" /></button>
                        <button className="p-2 hover:bg-gray-200 rounded-full"><FastForward className="h-5 w-5" /></button>
                    </div>
                    <div className="flex-grow">
                        <div className="text-xs text-gray-600 mb-1">10:35 AM / 11:15 AM</div>
                        <input type="range" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapFooter;
