import React from 'react'
import { TextInput, SingleSelect, SingleSelectOption } from '@strapi/design-system'
import { useQueryParams } from '@strapi/admin/strapi-admin'
import { Search, Cross } from '@strapi/icons'

type SearchType = 'orderId' | 'email'

/**
 * [AND-62] Order Search Component
 *
 * Búsqueda en el panel de administración por:
 * - Número de pedido (orderId)
 * - Email de cliente
 *
 * La búsqueda por email usa un endpoint personalizado /api/orders/search
 * que hace join con la tabla de usuarios.
 *
 * NOTA: La verificación de colección se hace en el componente padre OrderFiltersPanel.
 */
const OrderSearch: React.FC = () => {
  const [{ query }, setQuery] = useQueryParams()
  const [searchType, setSearchType] = React.useState<SearchType>('orderId')
  const [searchValue, setSearchValue] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)

  // Aplicar búsqueda
  const handleSearch = async () => {
    if (!searchValue.trim()) {
      setQuery({ filters: {} })
      return
    }

    const trimmedValue = searchValue.trim()

    if (searchType === 'email') {
      // Búsqueda por email usando endpoint personalizado
      setIsLoading(true)
      try {
        const token = localStorage.getItem('jwtToken') || ''
        const response = await fetch(
          `/api/orders/search?email=${encodeURIComponent(trimmedValue)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )

        if (!response.ok) {
          throw new Error('Search failed')
        }

        const data = await response.json()

        // Actualizar la lista con los resultados
        // Usamos los IDs de los pedidos encontrados para filtrar
        const orderIds = data.data?.map((order: any) => order.orderId) || []

        if (orderIds.length === 0) {
          // Si no hay resultados, aplicar un filtro que no devuelve nada
          setQuery({
            filters: {
              orderId: 'NONEXISTENT-ORDER-ID',
            },
          })
        } else {
          // Filtrar por los IDs encontrados
          setQuery({
            filters: {
              orderId: { $in: orderIds },
            },
          })
        }
      } catch (error) {
        console.error('Error searching by email:', error)
        // En caso de error, no hacer nada
      } finally {
        setIsLoading(false)
      }
    } else {
      // Búsqueda por orderId usando queryParams nativo
      setQuery({
        filters: {
          $and: [
            {
              orderId: {
                $contains: trimmedValue,
              },
            },
          ],
        },
      })
    }
  }

  // Limpiar búsqueda
  const handleClear = () => {
    setSearchValue('')
    setQuery({ filters: {} })
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <SingleSelect
        value={searchType}
        onChange={(value: SearchType) => {
          setSearchType(value)
          setSearchValue('')
          setQuery({ filters: {} })
        }}
        style={{ minWidth: '120px' }}
      >
        <SingleSelectOption value="orderId">Nº pedido</SingleSelectOption>
        <SingleSelectOption value="email">Email</SingleSelectOption>
      </SingleSelect>
      <TextInput
        placeholder={searchType === 'orderId' ? 'Buscar nº pedido...' : 'Buscar email...'}
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
        disabled={isLoading}
        style={{ minWidth: '200px' }}
      />
    </div>
  )
}

export default OrderSearch
