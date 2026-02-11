import React from 'react'
import { TextInput, SingleSelect, SingleSelectOption } from '@strapi/design-system'
import { useQueryParams, useFetchClient } from '@strapi/admin/strapi-admin'
import { Search, Cross } from '@strapi/icons'

type SearchType = 'orderId' | 'email'

/**
 * [AND-62] Order Search Component
 *
 * Búsqueda en el panel de administración por:
 * - Número de pedido (orderId)
 * - Email de cliente
 *
 * La búsqueda por email usa el Content Manager API para buscar clientes
 * (plugin::users-permissions.user) y luego filtra las órdenes por el usuario.
 *
 * NOTA: La verificación de colección se hace en el componente padre OrderFiltersPanel.
 */
const OrderSearch: React.FC = () => {
  const [{ query }, setQuery] = useQueryParams()
  const fetchClient = useFetchClient() // Cliente con autenticación automática
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
      // Búsqueda por email: buscar usuarios primero, luego filtrar orders
      // Búsqueda por email: buscar usuarios primero, luego filtrar orders
      setIsLoading(true)
      try {

        // Usar el endpoint correcto para buscar clientes (users-permissions)
        // en lugar de administradores (/admin/users)
        const { data: userData } = await fetchClient.get(
          `/content-manager/collection-types/plugin::users-permissions.user`,
          {
            params: {
              page: 1,
              pageSize: 10,
              filters: {
                email: {
                  $containsi: trimmedValue,
                },
              },
            },
          }
        )

        // En Content Manager v4/v5, la respuesta suele tener { results: [...] } o { data: [...] }
        // Verificamos ambas estructuras por compatibilidad
        const users = userData?.results || userData?.data || []

        if (users.length === 0) {
          setQuery({
            filters: {
              user: {
                documentId: 'NONEXISTENT-USER-ID' // Forzar sin resultados
              }
            },
          })
        } else {
          // Obtener los documentIds de los usuarios encontrados
          const userDocumentIds = users.map((u: any) => u.documentId || u.id)

          setQuery({
            filters: {
              user: {
                documentId: { $in: userDocumentIds },
              },
            },
          })
        }
      } catch (error) {
        console.error('[OrderSearch] Error:', error)
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
      <div style={{ minWidth: '120px' }}>
        <SingleSelect
          value={searchType}
          onChange={(value) => {
            setSearchType(value as SearchType)
            setSearchValue('')
            setQuery({ filters: {} })
          }}
        >
          <SingleSelectOption value="orderId">Nº pedido</SingleSelectOption>
          <SingleSelectOption value="email">Email</SingleSelectOption>
        </SingleSelect>
      </div>
      <TextInput
        placeholder={searchType === 'orderId' ? 'Buscar nº pedido...' : 'Buscar email...'}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        onKeyUp={(e) => {
          if (e.key === 'Enter') {
            handleSearch()
          }
        }}
        startAction={<Search width="16px" height="16px" />}
        endAction={
          searchValue ? (
            <button
              onClick={handleClear}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label="Clear search"
            >
              <Cross width="16px" height="16px" />
            </button>
          ) : (
            <button
              onClick={handleSearch}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label="Search"
            >
              <Search width="16px" height="16px" />
            </button>
          )
        }
        disabled={isLoading}
        style={{ minWidth: '200px' }}
      />
    </div>
  )
}

export default OrderSearch
