import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { WarningIcon } from '@/components/icons';
import NeedRow from './need-row';
import AddInsumoForm from './add-insumo-form';

type Insumo = { id: string; nombre: string; cantidad: number; urgente: boolean };

interface ListaEditorProps {
  initialNeed?: Insumo[];
  onSave?: (need: Insumo[]) => void;
}

const ListaEditor: React.FC<ListaEditorProps> = ({ initialNeed = [], onSave }) => {
  const [needItems, setNeedItems] = useState<Insumo[]>(initialNeed);
  const [urgentMode, setUrgentMode] = useState(false);

  const hasUrgent = needItems.some(item => item.urgente);

  const enterUrgentMode = useCallback(() => {
    setUrgentMode(true);
  }, []);

  // ... other handlers (add, remove, toggle, etc.)

  return (
    <div>
      {urgentMode ? (
        <div>
          {/* Urgent mode UI */}
          <button onClick={() => setUrgentMode(false)}>Volver</button>
          {needItems.map(item => (
            <NeedRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <>
          <ul>
            {needItems.length > 0 && needItems.map(item => (
              <NeedRow key={item.id} item={item} />
            ))}
          </ul>
          {/* Fix: conditionally render the urgente button */}
          {needItems.length > 0 && (
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={enterUrgentMode}
              disabled={false}
              className="text-accent"
            >
              <WarningIcon />
              {hasUrgent ? "Editar urgentes" : "Marcar como urgente"}
            </Button>
          )}
          {/* Agregar insumos button always visible */}
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={() => {}}
            className="text-accent"
          >
            Agregar insumos
          </Button>
        </>
      )}
    </div>
  );
};

export default ListaEditor;
