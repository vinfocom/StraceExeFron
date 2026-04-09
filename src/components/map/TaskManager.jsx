import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Plus, Filter } from 'lucide-react';

const TaskManager = () => {
    const [tasks, setTasks] = useState([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);

    // Mock data - replace with API call
    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true);
            // Simulate API call
            setTimeout(() => {
                setTasks([
                    {
                        id: 1,
                        title: 'Coverage Gap Investigation - Sector A',
                        status: 'open',
                        priority: 'high',
                        assignedTo: 'John Doe',
                        technology: 'LTE',
                        location: '28.6129, 77.2295',
                        createdAt: '2024-01-15',
                        dueDate: '2024-01-25'
                    },
                    {
                        id: 2,
                        title: 'Interference Analysis - Downtown Area',
                        status: 'in-progress',
                        priority: 'medium',
                        assignedTo: 'Jane Smith',
                        technology: '5G',
                        location: '28.6250, 77.2100',
                        createdAt: '2024-01-10',
                        dueDate: '2024-01-30'
                    },
                    {
                        id: 3,
                        title: 'Capacity Upgrade - Shopping Mall',
                        status: 'completed',
                        priority: 'high',
                        assignedTo: 'Mike Johnson',
                        technology: 'LTE',
                        location: '28.6000, 77.2400',
                        createdAt: '2024-01-05',
                        dueDate: '2024-01-20'
                    }
                ]);
                setLoading(false);
            }, 500);
        };

        fetchTasks();
    }, []);

    const getStatusBadge = (status) => {
        const variants = {
            open: 'default',
            'in-progress': 'secondary',
            completed: 'success',
            cancelled: 'destructive'
        };
        return <Badge variant={variants[status]}>{status}</Badge>;
    };

    const getPriorityBadge = (priority) => {
        const variants = {
            high: 'destructive',
            medium: 'warning',
            low: 'success'
        };
        return <Badge variant={variants[priority]}>{priority}</Badge>;
    };

    const filteredTasks = tasks.filter(task => {
        if (filter === 'all') return true;
        return task.status === filter;
    });

    return (
        <Card className="w-96 absolute bottom-4 left-4 z-10">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-lg">
                    <ClipboardList className="h-5 w-5 mr-2" />
                    Task Manager
                    <div className="ml-auto flex items-center space-x-2">
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger className="w-28 h-8">
                                <Filter className="h-3 w-3 mr-1" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in-progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button size="sm" className="h-8">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Task</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Priority</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTasks.map((task) => (
                                <TableRow 
                                    key={task.id} 
                                    className="cursor-pointer hover:bg-gray-50"
                                    onClick={() => {
                                        // Zoom to task location on map
                                        if (window.google && window.map) {
                                            const [lat, lng] = task.location.split(',').map(Number);
                                            window.map.setCenter({ lat, lng });
                                            window.map.setZoom(15);
                                        }
                                    }}
                                >
                                    <TableCell className="py-2">
                                        <div className="font-medium text-sm">{task.title}</div>
                                        <div className="text-xs text-gray-500">{task.technology}</div>
                                    </TableCell>
                                    <TableCell className="py-2">
                                        {getStatusBadge(task.status)}
                                    </TableCell>
                                    <TableCell className="py-2">
                                        {getPriorityBadge(task.priority)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default TaskManager;