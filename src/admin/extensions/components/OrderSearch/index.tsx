import React from 'react'
import { TextInput } from '@strapi/design-system'
import { useQueryParams } from '@strapi/admin/strapi-admin'
import { Search, Cross } from '@strapi/icons'

/**
 * [ORD-28] Order Search Component
 *
 * Búsqueda simple por número de pedido (orderId) en el panel de administración.
 *
 * NOTA: La búsqueda por email se aparca para futuras iteraciones porque
 * Strapi no permite filtrar por campos de relación (user.email) desde
 * el panel admin sin configuración adicional.
 *
 * NOTA: La verificación de colección se hace en el componente padre OrderFiltersPanel.
 */
const OrderSearch: React.FC = () => {
  const [{ query }, setQuery] = useQueryParams()
  const [searchValue, setSearchValue] = React.useState('')

  // Aplicar búsqueda por orderId
  const handleSearch = () => {
    if (!searchValue.trim()) {
      setQuery({ filters: {} })
      return
    }

    setQuery({
      filters: {
        $and: [
          {
            orderId: {
              $contains: searchValue.trim(),
            },
          },
        ],
      },
    })
  }

  // Limpiar búsqueda
  const handleClear = () => {
    setSearchValue('')
    setQuery({ filters: {} })
  }

  return (
    <TextInput
      placeholder="Buscar nº pedido..."
      value={searchValue}
      onChange={(e) => setSearchValue(e.target.value)}
      onKeyUp={(e) => {
        if (e.key === 'Enter') {
          handleSearch()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          handleClear()
        }
      }}
      startAction={<Search width="16px" height="16px" />}
      endAction={searchValue && (
        <button
          onClick={handleClear}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Clear search"
        >
          <Cross width="16px" height="16px" />
        </button>
      )}
      style={{ minWidth: '250px' }}
    />
  )
}

export default OrderSearch
