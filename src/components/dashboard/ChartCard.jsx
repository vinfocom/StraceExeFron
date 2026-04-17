// src/components/ChartCard.jsx
import React, { useRef, useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  MoreVertical, Filter, Settings as SettingsIcon, 
  Download, Table as TableIcon, ChartBar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import ChartFilterSettings from './ChartFilterSettings';
import ChartCardSkeleton from './skeletons/ChartCardSkeleton';
import { downloadCSVFromData, sanitizeFileName } from '@/utils/dashboardUtils';

const ChartCard = ({ 
  title, 
  dataset, 
  children, 
  exportFileName, 
  settings, 
  isLoading = false,
  chartFilters,
  onChartFiltersChange,
  operators = [],
  networks = [],
  showChartFilters = true,
  error = null,
  headerActions = null
}) => {
  const cardRef = useRef(null);
  const [showTable, setShowTable] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterSettingsOpen, setFilterSettingsOpen] = useState(false);

  const handleDownloadPNG = async () => {
    try {
      const node = cardRef.current?.querySelector('.chart-content') ?? cardRef.current;
      if (!node) {
        toast.error("Chart not found for export");
        return;
      }
      
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, { 
        cacheBust: true, 
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      
      const link = document.createElement('a');
      link.download = `${sanitizeFileName(exportFileName || title || 'chart')}.png`;
      link.href = dataUrl;
      link.click();
      
      toast.success("Chart exported as PNG");
    } catch (e) {
      console.error('PNG export error:', e);
      toast.error("Failed to export PNG");
    }
  };

  const handleDownloadCSV = () => {
    if (!dataset || dataset.length === 0) {
      toast.error("No data to export");
      return;
    }
    
    try {
      downloadCSVFromData(dataset, `${sanitizeFileName(exportFileName || title || 'chart')}.csv`);
      toast.success("Data exported as CSV");
    } catch (e) {
      console.error('CSV export error:', e);
      toast.error("Failed to export CSV");
    }
  };

  const columns = useMemo(() => {
    if (!Array.isArray(dataset) || dataset.length === 0) return [];
    
    const keys = Array.from(
      dataset.reduce((set, row) => {
        Object.entries(row || {}).forEach(([k, v]) => {
          if (['object', 'function'].includes(typeof v) || k.startsWith('_')) return;
          set.add(k);
        });
        return set;
      }, new Set())
    );
    
    return keys;
  }, [dataset]);

  const activeChartFilterLabels = useMemo(() => {
    if (!chartFilters) return [];
    const labels = [];

    if (chartFilters.operators?.length > 0) {
      labels.push(`Operators: ${chartFilters.operators.length}`);
    }

    if (chartFilters.networks?.length > 0) {
      labels.push(`Networks: ${chartFilters.networks.length}`);
    }

    return labels;
  }, [chartFilters]);

  const activeChartFiltersCount = activeChartFilterLabels.length;

  if (isLoading) {
    return <ChartCardSkeleton title={title} />;
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-md hover:shadow-xl transition-shadow duration-300 min-w-0">
      <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white pb-4">
        <div className="flex justify-between items-center gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2 truncate">
              <ChartBar className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <span className="truncate">{title}</span>
            </CardTitle>
            {activeChartFiltersCount > 0 && (
              <div className="flex items-center flex-wrap gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {activeChartFiltersCount} filter{activeChartFiltersCount > 1 ? 's' : ''} active
                </Badge>
                {activeChartFilterLabels.map((label) => (
                  <Badge key={label} variant="outline" className="text-[10px] font-medium">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {headerActions && (
              <div className="flex items-center">
                {headerActions}
              </div>
            )}
            
            {(dataset?.length > 0 || settings || showChartFilters) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <MoreVertical className="h-5 w-5 text-gray-600" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border border-gray-200 text-gray-800 w-56 shadow-lg">
                  {showChartFilters && (
                    <>
                      <DropdownMenuItem className="hover:bg-blue-50 cursor-pointer" onClick={() => setFilterSettingsOpen(true)}>
                        <Filter className="h-4 w-4 mr-2 text-blue-600" />
                        <span className="font-medium">Chart Filters</span>
                        {activeChartFiltersCount > 0 && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {activeChartFiltersCount}
                          </Badge>
                        )}
                      </DropdownMenuItem>
                      <div className="h-px bg-gray-200 my-1" />
                    </>
                  )}
                  
                  {settings && (
                    <>
                      <DropdownMenuItem className="hover:bg-gray-50 cursor-pointer" onClick={() => setSettingsOpen(true)}>
                        <SettingsIcon className="h-4 w-4 mr-2 text-gray-600" />
                        Settings
                      </DropdownMenuItem>
                      <div className="h-px bg-gray-200 my-1" />
                    </>
                  )}
                  
                  {dataset?.length > 0 && (
                    <>
                      <DropdownMenuItem className="hover:bg-gray-50 cursor-pointer" onClick={() => setShowTable(v => !v)}>
                        <TableIcon className="h-4 w-4 mr-2 text-gray-600" />
                        {showTable ? 'Show Chart' : 'Show Table'}
                      </DropdownMenuItem>
                      <div className="h-px bg-gray-200 my-1" />
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Export</div>
                      <DropdownMenuItem className="hover:bg-gray-50 cursor-pointer" onClick={handleDownloadPNG}>
                        <Download className="h-4 w-4 mr-2 text-gray-600" />
                        Download PNG
                      </DropdownMenuItem>
                      <DropdownMenuItem className="hover:bg-gray-50 cursor-pointer" onClick={handleDownloadCSV}>
                        <Download className="h-4 w-4 mr-2 text-gray-600" />
                        Download CSV
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative h-[320px] sm:h-[360px] lg:h-[390px] xl:h-[420px] p-3 sm:p-4 lg:p-6 min-h-0 min-w-0 overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <svg className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-lg font-medium">Failed to load data</p>
            <p className="text-sm mt-1 text-gray-500">{error.message || 'An error occurred'}</p>
          </div>
        ) : !dataset || dataset.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <ChartBar className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">No data available</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : showTable ? (
          <div className="h-full overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-gray-100 to-gray-50 sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="text-left px-4 py-3 font-bold text-gray-700 border-b-2 border-gray-300 uppercase text-xs tracking-wide">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.map((row, i) => (
                  <tr key={i} className="hover:bg-blue-50 transition-colors border-b border-gray-100">
                    {columns.map(c => (
                      <td key={c} className="px-4 py-3 text-gray-700">
                        {typeof row[c] === 'number' 
                          ? row[c].toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : String(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div ref={cardRef} className="chart-content h-full w-full min-h-0 min-w-0">
            <div className="h-full w-full min-h-[220px] min-w-0">
              {children}
            </div>
          </div>
        )}

        {showChartFilters && (
          <Dialog open={filterSettingsOpen} onOpenChange={setFilterSettingsOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-blue-600" />
                  Chart Filters - {title}
                </DialogTitle>
              </DialogHeader>
              <ChartFilterSettings
                operators={operators}
                networks={networks}
                value={chartFilters || {}}
                onChange={(newFilters) => {
                  onChartFiltersChange?.(newFilters);
                  setFilterSettingsOpen(false);
                  toast.success("Chart filters applied");
                }}
                showOperators={true}
                showNetworks={true}
                showDateRange={true}
                showTopN={true}
              />
            </DialogContent>
          </Dialog>
        )}

        {settings && (
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{settings.title || 'Settings'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {typeof settings.render === 'function' ? settings.render() : settings.render}
              </div>
              <DialogFooter className="gap-2">
                <button
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  onClick={() => setSettingsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => {
                    if (typeof settings.onApply === 'function') settings.onApply();
                    setSettingsOpen(false);
                  }}
                >
                  Apply
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
};

export default ChartCard;
