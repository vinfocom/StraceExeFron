import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Filter, Wifi, TowerControl, Users, MapPin, BarChart } from 'lucide-react';

const LayerCategory = ({ title, icon: Icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center">
          <Icon className="h-4 w-4 mr-2 text-gray-600" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </div>
      {isOpen && <div className="p-2 bg-gray-50">{children}</div>}
    </div>
  );
};

const LayerItem = ({ label, checked, onCheckedChange, color }) => (
  <div className="flex items-center justify-between p-2 hover:bg-gray-100 rounded">
    <div className="flex items-center">
      {color && <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />}
      <Label htmlFor={label} className="text-sm cursor-pointer">{label}</Label>
    </div>
    <Switch id={label} checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

const LayerManager = ({ layers, onLayerChange }) => {
  const categories = [
    {
      title: "Signal Strength Metrics",
      icon: BarChart,
      layers: [
        { id: 'rsrp-lte', label: 'LTE RSRP', type: 'metric', technology: 'LTE' },
        { id: 'sinr-lte', label: 'LTE SINR', type: 'metric', technology: 'LTE' },
        { id: 'rsrq-lte', label: 'LTE RSRQ', type: 'metric', technology: 'LTE' },
        { id: 'rsrp-nr', label: 'NR RSRP', type: 'metric', technology: 'NR' },
        { id: 'sinr-nr', label: 'NR SINR', type: 'metric', technology: 'NR' },
      ]
    },
    {
      title: "Cell Infrastructure",
      icon: TowerControl,
      layers: [
        { id: 'sites', label: 'Cell Sites', type: 'infrastructure' },
        { id: 'sectors', label: 'Cell Sectors', type: 'infrastructure' },
        { id: 'lte-cells', label: 'LTE Cells', type: 'infrastructure', technology: 'LTE' },
        { id: 'nr-cells', label: 'NR Cells', type: 'infrastructure', technology: 'NR' },
        { id: 'gsm-cells', label: 'GSM Cells', type: 'infrastructure', technology: 'GSM' },
      ]
    },
    {
      title: "Data Sources",
      icon: Users,
      layers: [
        { id: 'drive-test', label: 'Drive Test Data', type: 'source' },
        { id: 'crowdsource', label: 'Crowdsource Data', type: 'source' },
        { id: 'mr', label: 'Measurement Reports', type: 'source' },
      ]
    },
    {
      title: "Performance Issues",
      icon: Wifi,
      layers: [
        { id: 'voice-failures', label: 'Voice Failures', type: 'issue' },
        { id: 'data-failures', label: 'Data Failures', type: 'issue' },
        { id: 'handover-failures', label: 'Handover Failures', type: 'issue' },
        { id: 'coverage-gaps', label: 'Coverage Gaps', type: 'issue' },
      ]
    },
    {
      title: "Geographical Features",
      icon: MapPin,
      layers: [
        { id: 'buildings', label: 'Building Footprints', type: 'geo' },
        { id: 'terrain', label: 'Terrain Data', type: 'geo' },
        { id: 'clutter', label: 'Land Clutter', type: 'geo' },
      ]
    }
  ];

  return (
    <Card className="w-80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <Filter className="h-5 w-5 mr-2" />
          Layer Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {categories.map(category => (
          <LayerCategory key={category.title} title={category.title} icon={category.icon}>
            {category.layers.map(layer => (
              <LayerItem
                key={layer.id}
                label={layer.label}
                checked={layers[layer.id] || false}
                onCheckedChange={(checked) => onLayerChange(layer.id, checked)}
              />
            ))}
          </LayerCategory>
        ))}
      </CardContent>
    </Card>
  );
};

export default LayerManager;