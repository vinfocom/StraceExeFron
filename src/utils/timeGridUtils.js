
export function getLogTimestamp(log) {
  const ts = log.timestamp || log.time || log.datetime || log.created_at;
  if (!ts) return null;
  const date = new Date(ts);
  return isNaN(date.getTime()) ? null : date;
}


export function getHourOfDay(date) {
  return date.getHours();
}


export function getDayOfWeek(date) {
  return date.getDay();
}


export function filterLogsByTimeRange(logs, startHour, endHour) {
  if (!Array.isArray(logs)) return [];
  if (startHour === 0 && endHour === 23) return logs; // All day
  
  return logs.filter(log => {
    const ts = getLogTimestamp(log);
    if (!ts) return false;
    
    const hour = getHourOfDay(ts);
    
    if (startHour <= endHour) {
      return hour >= startHour && hour <= endHour;
    } else {
      
      return hour >= startHour || hour <= endHour;
    }
  });
}


export function filterLogsByHour(logs, hour) {
  if (!Array.isArray(logs)) return [];
  
  return logs.filter(log => {
    const ts = getLogTimestamp(log);
    if (!ts) return false;
    return getHourOfDay(ts) === hour;
  });
}


export function filterLogsByDayOfWeek(logs, days = []) {
  if (!Array.isArray(logs) || days.length === 0) return logs;
  
  return logs.filter(log => {
    const ts = getLogTimestamp(log);
    if (!ts) return false;
    return days.includes(getDayOfWeek(ts));
  });
}


export function getTimeDistribution(logs) {
  const hourCounts = Array(24).fill(0);
  
  logs.forEach(log => {
    const ts = getLogTimestamp(log);
    if (ts) {
      const hour = getHourOfDay(ts);
      hourCounts[hour]++;
    }
  });
  
  return hourCounts;
}

export function formatHour(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${ampm}`;
}

export function formatHourRange(startHour, endHour) {
  return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}


export function getDayName(dayIndex) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayIndex] || '';
}


export function analyzeTemporalPatterns(logs) {
  const hourly = Array(24).fill(0).map(() => []);
  const daily = Array(7).fill(0).map(() => []);
  
  logs.forEach(log => {
    const ts = getLogTimestamp(log);
    if (!ts) return;
    
    const hour = getHourOfDay(ts);
    const day = getDayOfWeek(ts);
    
    hourly[hour].push(log);
    daily[day].push(log);
  });
  
  return {
    hourly,
    daily,
    peakHour: hourly.indexOf(hourly.reduce((max, curr) => curr.length > max.length ? curr : max, [])),
    peakDay: daily.indexOf(daily.reduce((max, curr) => curr.length > max.length ? curr : max, [])),
  };
}