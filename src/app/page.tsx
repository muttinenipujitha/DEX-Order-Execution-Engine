'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { useOrderWebSocket, useOrderData } from '@/hooks/use-order-websocket'
import {
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  BarChart3,
  Activity,
  AlertCircle,
  RefreshCw
} from 'lucide-react'

interface Order {
  id: string
  status: string
  chosenDex?: string
  executedPrice?: string
  transactionHash?: string
  raydiumPrice?: string
  meteoraPrice?: string
  priceDifference?: number
  errorMessage?: string
  retryCount: number
  createdAt: string
  updatedAt: string
  amountIn?: string
}

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ROUTING: 'bg-blue-100 text-blue-800',
  BUILDING: 'bg-purple-100 text-purple-800',
  SUBMITTED: 'bg-orange-100 text-orange-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800'
} as const

const statusIcons = {
  PENDING: Clock,
  ROUTING: Activity,
  BUILDING: Loader2,
  SUBMITTED: TrendingUp,
  CONFIRMED: CheckCircle,
  FAILED: XCircle
} as const

export default function OrderExecutionEngine() {
  const [formData, setFormData] = useState({
    tokenIn: 'So11111111111111111111111111111111111111112', // SOL
    tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    amountIn: '1.0',
    slippage: 0.01
  })

  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { isConnected, orderStatus, subscribeToOrder, unsubscribeFromOrder } = useOrderWebSocket(selectedOrder || undefined)
const { order, orders, loading, error, submitOrder, fetchAllOrders } = useOrderData(selectedOrder || undefined)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllOrders()
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchAllOrders])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const result = await submitOrder(formData)
      if (result?.success) {
        setSelectedOrder(result.orderId)
        subscribeToOrder(result.orderId)
        await fetchAllOrders()
      } else {
        setSubmitError(result?.error || 'Failed to submit order')
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit order')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusProgress = (status: string) => {
    const statusOrder = ['PENDING', 'ROUTING', 'BUILDING', 'SUBMITTED', 'CONFIRMED']
    const currentIndex = statusOrder.indexOf(status)
    return status === 'FAILED' ? 0 : ((currentIndex + 1) / statusOrder.length) * 100
  }

  const formatPrice = (price: string) => {
    const num = parseFloat(price)
    if (Number.isNaN(num)) return price
    return num.toFixed(6)
  }

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString()

  const selectedOrderData = orders.find((o: Order) => o.id === selectedOrder)

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">DEX Order Execution Engine</h1>
          <p className="text-muted-foreground">Market orders with intelligent DEX routing</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={isConnected ? 'default' : 'destructive'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchAllOrders}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="h-5 w-5 mr-2" />
              Submit Order
            </CardTitle>
            <CardDescription>Execute market orders with best DEX routing</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="tokenIn">Input Token (SOL)</Label>
                <Input
                  id="tokenIn"
                  value={formData.tokenIn}
                  onChange={(e) => setFormData({ ...formData, tokenIn: e.target.value })}
                  placeholder="Token mint address"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label htmlFor="tokenOut">Output Token (USDC)</Label>
                <Input
                  id="tokenOut"
                  value={formData.tokenOut}
                  onChange={(e) => setFormData({ ...formData, tokenOut: e.target.value })}
                  placeholder="Token mint address"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label htmlFor="amountIn">Amount</Label>
                <Input
                  id="amountIn"
                  type="number"
                  step="0.01"
                  value={formData.amountIn}
                  onChange={(e) => setFormData({ ...formData, amountIn: e.target.value })}
                  placeholder="Amount to swap"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label htmlFor="slippage">Slippage Tolerance (%)</Label>
                <Input
                  id="slippage"
                  type="number"
                  step="0.01"
                  value={formData.slippage}
                  onChange={(e) =>
                    setFormData({ ...formData, slippage: Number(e.target.value) || 0 })
                  }
                  placeholder="0.01"
                  disabled={isSubmitting}
                />
              </div>

              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting || !isConnected}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Execute Order
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Order Details & Status */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selected Order Status */}
          {selectedOrderData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Order Status</span>
                  <Badge variant="outline">{selectedOrderData.id.slice(0, 8)}...</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge
                    className={
                      statusColors[selectedOrderData.status as keyof typeof statusColors] ||
                      'bg-gray-100 text-gray-800'
                    }
                  >
                    {(() => {
                      const IconComponent =
                        statusIcons[selectedOrderData.status as keyof typeof statusIcons] || Clock
                      return <IconComponent className="h-3 w-3 mr-1 inline" />
                    })()}
                    {selectedOrderData.status}
                  </Badge>

                  <span className="text-sm text-muted-foreground">
                    {formatTime(selectedOrderData.updatedAt)}
                  </span>
                </div>

                <Progress value={getStatusProgress(selectedOrderData.status)} className="h-2" />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Chosen DEX:</span>
                    <p>{selectedOrderData.chosenDex || 'Determining...'}</p>
                  </div>
                  <div>
                    <span className="font-medium">Executed Price:</span>
                    <p>
                      {selectedOrderData.executedPrice
                        ? formatPrice(selectedOrderData.executedPrice)
                        : 'Pending...'}
                    </p>
                  </div>
                </div>

                {selectedOrderData.raydiumPrice && selectedOrderData.meteoraPrice && (
                  <div className="space-y-2">
                    <Label>DEX Price Comparison</Label>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-2 border rounded">
                        <div className="font-medium">Raydium</div>
                        <div>{formatPrice(selectedOrderData.raydiumPrice)}</div>
                      </div>
                      <div className="p-2 border rounded">
                        <div className="font-medium">Meteora</div>
                        <div>{formatPrice(selectedOrderData.meteoraPrice)}</div>
                      </div>
                    </div>
                    {typeof selectedOrderData.priceDifference === 'number' && (
                      <div className="text-sm text-muted-foreground">
                        Price difference: {(selectedOrderData.priceDifference * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                )}

                {selectedOrderData.transactionHash && (
                  <div>
                    <Label>Transaction Hash</Label>
                    <div className="p-2 bg-muted rounded text-sm font-mono break-all">
                      {selectedOrderData.transactionHash}
                    </div>
                  </div>
                )}

                {selectedOrderData.errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{selectedOrderData.errorMessage}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Orders List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Order History
              </CardTitle>
              <CardDescription>Recent orders and their execution status</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No orders yet. Submit your first order above.
                    </div>
                  ) : (
                    orders.map((order: Order) => {
                      const IconComponent =
                        statusIcons[order.status as keyof typeof statusIcons] || Clock

                      return (
                        <div
                          key={order.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedOrder === order.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setSelectedOrder(order.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Badge
                                className={
                                  statusColors[order.status as keyof typeof statusColors] ||
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                <IconComponent className="h-3 w-3 mr-1 inline" />
                                {order.status}
                              </Badge>

                              {order.chosenDex && <Badge variant="outline">{order.chosenDex}</Badge>}
                            </div>

                            <div className="text-sm text-muted-foreground">
                              {formatTime(order.createdAt)}
                            </div>
                          </div>

                          <div className="mt-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span>Amount: {order.amountIn ?? '-'} SOL</span>
                              {order.executedPrice && (
                                <span className="font-medium">
                                  {formatPrice(order.executedPrice)} USDC
                                </span>
                              )}
                            </div>
                          </div>

                          {order.transactionHash && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Tx: {order.transactionHash.slice(0, 10)}...
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{orders.length}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold text-green-600">
                  {orders.filter((o: Order) => o.status === 'CONFIRMED').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {orders.filter((o: Order) =>
                    ['PENDING', 'ROUTING', 'BUILDING', 'SUBMITTED'].includes(o.status)
                  ).length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">
                  {orders.filter((o: Order) => o.status === 'FAILED').length}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optional: show loading/error */}
      {loading && <p className="text-sm text-muted-foreground">Loading orders…</p>}
      {error && <p className="text-sm text-red-600">{String(error)}</p>}
    </div>
  )
}

