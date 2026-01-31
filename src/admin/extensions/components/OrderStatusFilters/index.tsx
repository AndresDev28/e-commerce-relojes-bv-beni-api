import React from 'react'
import { Button } from '@strapi/design-system'
import { Flex } from '@strapi/design-system'
import { Typography } from '@strapi/design-system'
import { Filter } from '@strapi/icons'
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

const QUICK_FILTERS = [
  { label: 'Todos', value: null },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Pagados', value: 'paid' },
  { label: 'En Proceso', value: 'processing' },
  { label: 'Enviados', value: 'shipped' },
  { label: 'Entregados', value: 'delivered' },
  { label: 'Cancelados', value: 'cancelled' },
  { label: 'Reenbolsado', value: 'refunded' },
] as const

const OrderStatusFilters: React.FC = () => {
  const [{ query }, setQuery] = useQueryParams()

  // [ORD-27] Solo renderizar en la colección Orders
  // Detectamos si estamos en Orders por la URL
  const isOrdersCollection = React.useMemo(() => {
    const pathname = window.location.pathname
    // La URL en Strapi admin es: /admin/content-manager/collection-types/{api::order.order}
    return pathname.includes('/collection-types/') &&
          (pathname.includes('api::order.order') || pathname.includes('order'))
  }, [])

  // Si no estamos en Orders, no renderizar nada
  if (!isOrdersCollection) {
    return null
  }

  const applyFilter = (status: string | null) => {
    if (status === null) {
      setQuery({ filters: {} })
    } else {
      setQuery({
        filters: {
          $and: [
            {
              orderStatus: {
                $eq: status,
              },
            },
          ],
        },
      })
    }
  }

  const isFilterActive = (status: string | null): boolean => {
    const filters = (query as QueryParams).filters

    if (!filters?.$and) {
      return status === null
    }

    const statusFilter = filters.$and.find(
      (filter: any) => filter.orderStatus?.$eq
    )

    if (!statusFilter) {
      return status === null
    }

    return statusFilter.orderStatus?.$eq === status
  }

  return (
    <Flex
      gap={1}
      padding={1}
      background="neutral0"
      borderColor="neutral200"
      borderWidth="1px"
      borderStyle="solid"
      borderRadius="4px"
      alignItems="center"
      wrap="wrap"
    >
      <Filter width="16px" height="16px" aria-hidden="true" />
      <Typography variant="pi" fontWeight="bold" textColor="neutral600">
        Filtros:
      </Typography>
      {QUICK_FILTERS.map(({ label, value }) => (
        <Button
          key={value ?? 'all'}
          variant={isFilterActive(value) ? 'secondary' : 'tertiary'}
          size="S"
          onClick={() => applyFilter(value)}
          style={{ fontSize: '13px' }}
        >
          {label}
        </Button>
      ))}
    </Flex>
  )
}

export default OrderStatusFilters
