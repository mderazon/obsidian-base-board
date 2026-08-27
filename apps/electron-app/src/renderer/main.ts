/**
 * Base Board Electron App - Renderer Entry Point
 */

import { KanbanBoard } from './components/kanban-board';
import { InputModal } from './components/input-modal';
import { ConfirmModal } from './components/confirm-modal';
import './styles/main.css';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container')!;
  const openFolderBtn = document.getElementById('btn-open-folder') as HTMLButtonElement;

  // Helper to get tasks directory from base file path
  function getTasksDir(baseFilePath: string): string {
    const dir = baseFilePath.substring(0, baseFilePath.lastIndexOf('/')) || 
                baseFilePath.substring(0, baseFilePath.lastIndexOf('\\'));
    const baseName = baseFilePath.split(/[\\/]/).pop()?.replace('.base', '') || '';
    return `${dir}/${baseName}/tasks`;
  }

  // Helper to get base file path from card file path
  function getBaseFilePath(cardFilePath: string): string {
    const parts = cardFilePath.split(/[\\/]/);
    const tasksIndex = parts.findIndex(p => p === 'tasks');
    if (tasksIndex > 0) {
      const baseName = parts[tasksIndex - 1];
      return parts.slice(0, tasksIndex - 1).join('/') + '/' + baseName + '.base';
    }
    return '';
  }

  // Initialize the Kanban board with callbacks
  const board = new KanbanBoard(boardContainer, {
    async onRename(cardId: string, newTitle: string): Promise<void> {
      console.log('[Renderer] Renaming card:', cardId, 'to', newTitle);
      
      // Find the card in state
      const cardState = (board as any).boardState.cards.find((c: any) => c.id === cardId);
      if (!cardState) {
        alert('Card not found in state');
        return;
      }

      // Update title in state
      cardState.title = newTitle;

      // Save to file
      try {
        await window.electronAPI.updateCard(cardState.filePath, {
          ...cardState.properties,
          title: newTitle,
        }, '');
        
        console.log('[Renderer] Card renamed successfully');
        board.refresh();
      } catch (error) {
        console.error('[Renderer] Failed to rename card:', error);
        alert('Failed to rename card: ' + error);
      }
    },

    async onDelete(cardId: string): Promise<void> {
      console.log('[Renderer] Deleting card:', cardId);
      
      // Find the card in state
      const cardState = (board as any).boardState.cards.find((c: any) => c.id === cardId);
      if (!cardState) {
        alert('Card not found in state');
        return;
      }

      // Delete from file system
      try {
        await window.electronAPI.deleteCard(cardState.filePath);
        
        // Remove from board state
        const boardState = (board as any).boardState;
        boardState.cards = boardState.cards.filter((c: any) => c.id !== cardId);
        
        console.log('[Renderer] Card deleted successfully');
        board.refresh();
      } catch (error) {
        console.error('[Renderer] Failed to delete card:', error);
        alert('Failed to delete card: ' + error);
      }
    },

    async onOpen(cardId: string): Promise<void> {
      console.log('[Renderer] Opening card:', cardId);
      
      // Find the card in state
      const cardState = (board as any).boardState.cards.find((c: any) => c.id === cardId);
      if (!cardState) {
        alert('Card not found in state');
        return;
      }

      // Open file with default application
      try {
        await window.electronAPI.openFile({ 'All Files': ['*'] });
        console.log('[Renderer] File open dialog shown');
      } catch (error) {
        console.error('[Renderer] Failed to open card:', error);
        alert('Failed to open card: ' + error);
      }
    },

    async onCreateCard(columnId: string): Promise<void> {
      console.log('[Renderer] Creating new card in column:', columnId);
      
      // Get base file path from ANY card (not just target column)
      const boardState = (board as any).boardState;
      const sampleCard = boardState.cards[0];
      
      if (!sampleCard || !sampleCard.filePath) {
        alert('No cards found to determine board location');
        return;
      }

      const baseFilePath = getBaseFilePath(sampleCard.filePath);
      const tasksDir = getTasksDir(baseFilePath);
      
      // Get the column name for status field
      const column = boardState.columns.find(c => c.id === columnId);
      if (!column) {
        alert('Column not found');
        return;
      }

      // Get card name from user
      new InputModal(
        'New card',
        'Enter card title',
        async (title: string) => {
          if (!title.trim()) return;

          try {
            // Create the card file with status set to column name
            const frontmatter = {
              title: title.trim(),
              status: column.name,
              kanban_order: Date.now() / 1000,
            };

            const newFilePath = await window.electronAPI.createCard(tasksDir, frontmatter, '');
            
            // Add to board state
            const newCard = {
              id: `card-${Date.now()}`,
              title: title.trim(),
              columnId,
              order: Date.now() / 1000,
              tags: [],
              properties: frontmatter,
              filePath: newFilePath,
            };

            boardState.cards.push(newCard);
            
            console.log('[Renderer] Card created:', newFilePath, 'with status:', column.name);
            board.refresh();
          } catch (error) {
            console.error('[Renderer] Failed to create card:', error);
            alert('Failed to create card: ' + error);
          }
        },
      );
    },

    async onCardMove(cardId: string, oldColumnId: string, newColumnId: string): Promise<void> {
      console.log('[Renderer] Card moved:', cardId, 'from', oldColumnId, 'to', newColumnId);
      
      // Find the card in state
      const cardState = (board as any).boardState.cards.find((c: any) => c.id === cardId);
      if (!cardState) {
        console.warn('[Renderer] Card not found in state:', cardId);
        return;
      }

      // Get the new column name
      const newColumn = (board as any).boardState.columns.find((c: any) => c.id === newColumnId);
      if (!newColumn) {
        console.warn('[Renderer] New column not found:', newColumnId);
        return;
      }

      // Update the status field in the card file
      try {
        const updatedFrontmatter = {
          ...cardState.properties,
          status: newColumn.name,
        };
        
        await window.electronAPI.updateCard(cardState.filePath, updatedFrontmatter, '');
        console.log('[Renderer] Card status updated to:', newColumn.name);
      } catch (error) {
        console.error('[Renderer] Failed to update card status:', error);
      }
    },
  });

  // Handle folder selection
  openFolderBtn.addEventListener('click', async () => {
    console.log('[Renderer] Button clicked');
    
    try {
      console.log('[Renderer] Calling electronAPI.openFolder()...');
      const folderPath = await window.electronAPI.openFolder();
      console.log('[Renderer] Folder path returned:', folderPath);
      
      if (folderPath) {
        console.log('Selected folder:', folderPath);
        
        try {
          // Scan for .base files in the selected folder
          console.log('[Renderer] Reading directory:', folderPath);
          const entries = await window.electronAPI.readDir(folderPath);
          console.log('[Renderer] Directory entries:', entries);
          
          const baseFiles = entries.filter(entry => entry.endsWith('.base'));
          console.log('[Renderer] Base files found:', baseFiles);
          
          if (baseFiles.length > 0) {
            // Load the first .base file found
            const baseFilePath = `${folderPath}/${baseFiles[0]}`;
            console.log('[Renderer] Loading board from:', baseFilePath);
            await board.loadBoard(baseFilePath);
          } else {
            alert('No .base file found in the selected folder.');
          }
        } catch (error) {
          console.error('[Renderer] Error reading directory:', error);
          alert('Error reading folder: ' + error);
        }
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      alert('Failed to open folder: ' + error);
    }
  });

  // Listen for file changes from main process
  window.electronAPI.onFileChanged((data) => {
    console.log('File changed:', data);
    
    // Refresh the board UI when files change
    board.refresh();
  });
});
