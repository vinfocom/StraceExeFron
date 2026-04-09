import React, { useState, useEffect } from 'react';
import { homeApi, adminApi } from '../../api/apiEndpoints';
import { toast } from 'react-toastify';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UserFormDialog = ({ isOpen, onClose, onSave, user, isLoadingDetails }) => {
    const [formData, setFormData] = useState({
        id: 0,
        name: '',
        email: '',
        mobile: '',
        isactive: true,
        m_user_type_id: 1,
    });
    const [userTypes, setUserTypes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchUserTypes = async () => {
            try {
                const types = await homeApi.getMasterUserTypes();
                setUserTypes(Array.isArray(types) ? types : []);
            } catch (error) {
                toast.error("Failed to load user roles.");
            }
        };

        if (isOpen) {
            fetchUserTypes();
            if (user) {
                setFormData({
                    id: user.id || 0,
                    name: user.name || '',
                    email: user.email || '',
                    mobile: user.mobileno || user.mobile || '', // Handle different property names
                    isactive: user.isactive,
                    m_user_type_id: user.m_user_type_id || user.UserType || 1,
                });
            } else {
                setFormData({
                    id: 0,
                    name: '',
                    email: '',
                    mobile: '',
                    isactive: true,
                    m_user_type_id: 1,
                });
            }
        }
    }, [user, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (value) => {
        setFormData(prev => ({ ...prev, m_user_type_id: parseInt(value) }));
    };

    const handleStatusChange = (checked) => {
        setFormData(prev => ({ ...prev, isactive: checked }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const dataToSend = new FormData();
        Object.keys(formData).forEach(key => {
            dataToSend.append(key, formData[key]);
        });

        try {
            await adminApi.saveUserDetails(dataToSend);
            toast.success(`User successfully ${user ? 'updated' : 'created'}!`);
            onSave();
        } catch (error) {
            toast.error(`Failed to save user: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const dialogTitle = user ? 'Edit User' : 'Add New User';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                </DialogHeader>
                {isLoadingDetails ? (
                    <div className="flex justify-center items-center h-60">
                        <div 
                            className="w-10 h-10 border-4 border-blue-500 border-solid rounded-full animate-spin" 
                            style={{ borderTopColor: 'transparent' }}
                        ></div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">Name</Label>
                                <Input id="name" name="name" value={formData.name} onChange={handleChange} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="email" className="text-right">Email</Label>
                                <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="mobile" className="text-right">Mobile</Label>
                                <Input id="mobile" name="mobile" value={formData.mobile} onChange={handleChange} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="user-type" className="text-right">User Type</Label>
                                <Select onValueChange={handleSelectChange} value={String(formData.m_user_type_id)}>
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {userTypes.map(type => (
                                            <SelectItem key={type.id} value={String(type.id)}>
                                                {type.type}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="isactive" className="text-right">Status</Label>
                                <Switch id="isactive" checked={formData.isactive} onCheckedChange={handleStatusChange} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : 'Save changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default UserFormDialog;