import { getColorForValue } from './colorMapper';

export const getMarkerColor = (value, metric) => {
    return getColorForValue(value, metric);
};