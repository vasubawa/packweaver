import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../context/ToastContext';

export function useDeleteInstance(id: string, onDeleted: (id: string) => void) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { addToast } = useToast();

  const confirmDelete = async () => {
    try {
      await invoke('delete_instance', { id });
      setShowDeleteModal(false);
      onDeleted(id);
    } catch (e) {
      console.error('Failed to delete instance:', e);
      addToast('Failed to delete pack', 'error');
    }
  };

  return {
    showDeleteModal,
    requestDelete: () => setShowDeleteModal(true),
    cancelDelete: () => setShowDeleteModal(false),
    confirmDelete,
  };
}
