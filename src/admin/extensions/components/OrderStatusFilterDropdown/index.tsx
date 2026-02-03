import React from 'react'
import { SingleSelect, SingleSelectOption } from '@strapi/design-system'
import { useQueryParams } from '@strapi/admin/strapi-admin'

// Tipos para los filtros de Strapi
type StrapiFilter = {
  $eq?: string
}

type StrapiFilterCondition = {
  [key: string]: StrapiFilter | undefined
  orderStatus?: StrapiFilter
}

type StrapiFilters = {
  $and?: StrapiFilterCondition[]
}

type QueryParams = {
  filters?: StrapiFilters
  [key: string]: any
}

const STATUS_OPTIONS = [
  { label: 'Todos', value: null },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Pagados', value: 'paid' },
  { label: 'En Proceso', value: 'processing' },
  { label: 'Enviados', value: 'shipped' },
  { label: 'Entregados', value: 'delivered' },
  { label: 'Reembolsados', value: 'refunded' },
  { label: 'Cancelados', value: 'cancelled' },
] as const

/**
 * [ORD-27/28] Order Status Filter Dropdown Component
 *
 * Dropdown para filtrar pedidos por estado de forma compacta.
 */
const OrderStatusFilterDropdown: React.FC = () => {
  const [{ query }, setQuery] = useQueryParams()

  // Detectar el filtro activo actualmente
  const activeStatus = React.useMemo((): string | null => {
    const filters = (query as QueryParams).filters

    if (!filters?.$and) {
      return null
    }

    const statusFilter = filters.$and.find(
      (filter: any) => filter.orderStatus?.$eq
    )

    return statusFilter?.orderStatus?.$eq || null
  }, [query])

  // Aplicar filtro al cambiar selección
  const handleChange = (value: string | number) => {
    const valueStr = String(value)

    if (valueStr === '') {
      setQuery({ filters: {} })
    } else {
      setQuery({
        filters: {
          $and: [
            {
              orderStatus: {
                $eq: valueStr,
              },
            },
          ],
        },
      })
    }
  }

  return (
    <div style={{ minWidth: '180px' }}>
      <SingleSelect
        placeholder="Estado: Todos"
        value={activeStatus || ''}
        onChange={handleChange}
      >
        {STATUS_OPTIONS.map(({ label, value }) => (
          <SingleSelectOption key={value ?? 'all'} value={value ?? ''}>
            {label}
          </SingleSelectOption>
        ))}
      </SingleSelect>
    </div>
  )
}

export default OrderStatusFilterDropdown
