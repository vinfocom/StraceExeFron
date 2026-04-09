import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const StatisticsPanel = ({ chartData, onClose }) => {
    const { coveragePerfGraph, handsetWiseAvgGraph } = chartData || {};

    return (
        <div className="absolute top-4 right-4 w-96 max-w-md h-auto bg-gray-800/95 text-slate-800 p-4 rounded-lg shadow-2xl z-20 border">
             <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Statistics</CardTitle>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800">&times;</button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h4 className="font-semibold text-sm mb-2">Coverage Performance</h4>
                        {coveragePerfGraph && coveragePerfGraph.length > 0 ? (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={coveragePerfGraph}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" fontSize={10} />
                                    <YAxis fontSize={10} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-xs text-gray-500 text-center">No coverage data available.</p>}
                    </div>

                     <div>
                        <h4 className="font-semibold text-sm mb-2">Handset Averages</h4>
                         {handsetWiseAvgGraph && handsetWiseAvgGraph.length > 0 ? (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={handsetWiseAvgGraph} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" fontSize={10} />
                                    <YAxis dataKey="name" type="category" width={80} fontSize={10} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#82ca9d" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-xs text-gray-500 text-center">No handset data available.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default StatisticsPanel;