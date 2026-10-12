import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DataTable = ({ columns, data, className, tableClassName, headClassName, cellClassName, rowClassName }) => {
    return (
        <Card className={className}>
            <CardContent className="p-0">
                <Table className={tableClassName}>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead key={column.header} className={cn("text-lg", headClassName, column.className)}>{column.header}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data && data.length > 0 ? (
                            data.map((row, rowIndex) => (
                                <TableRow key={row.id || rowIndex} className={rowClassName}>
                                    {columns.map((column) => (
                                        <TableCell key={column.accessor || column.header} className={cn("text-lg", cellClassName, column.className)}>
                                            {column.render ? column.render(row, rowIndex) : row[column.accessor]}
                                        </TableCell >
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center ">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

export default DataTable;
