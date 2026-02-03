import React from 'react'
import { Flex } from '@strapi/design-system'
import OrderStatusFilterDropdown from '../OrderStatusFilterDropdown'
import OrderSearch from '../OrderSearch'

/**
 * [ORD-28] Order Filters Panel Component
 *
 * Panel contenedor que agrupa los filtros de estado y la búsqueda
 * en una sola fila compacta para el panel de administración de Orders.
 */
const OrderFiltersPanel: React.FC = () => {
  // [ORD-28] Solo renderizar en Orders
  const isOrdersCollection = React.useMemo(() => {
    const pathname = window.location.pathname
    return pathname.includes('/collection-types/') && (pathname.includes('api::order.order') || pathname.includes('order'))
  }, [])

  if (!isOrdersCollection) {
    return null
  }

  return (
    <Flex
      gap={2}
      padding={2}
      background="neutral0"
      borderColor="neutral200"
      borderWidth="1px"
      borderStyle="solid"
      borderRadius="4px"
      alignItems="center"
      wrap="wrap"
    >
      <OrderStatusFilterDropdown />
      <OrderSearch />
    </Flex>
  )
}

export default OrderFiltersPanel
