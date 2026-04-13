from datamodel import OrderDepth, UserId, TradingState, Order
from typing import List
import string

class Trader:

    def bid(self):
        return 15

    def get_wall_mid(self, product, state):
        order_depth: OrderDepth = state.order_depths[product]
        largest_bid_price, largest_bid = max(order_depth.buy_orders.items(), key=lambda x: x[1])
        largest_ask_price, largest_ask = max(order_depth.sell_orders.items(), key=lambda x: abs(x[1]))
        wall_mid = (largest_bid_price + largest_ask_price) / 2
        
        return wall_mid, largest_bid, largest_ask 

    def simple_mid_price_strategy(self, product, state, true_value):
        order_depth: OrderDepth = state.order_depths[product]
        buy_orders = sorted(order_depth.buy_orders.items(), reverse=True)
        sell_orders = sorted(order_depth.sell_orders.items())
        position = state.position.get(product, 0)
        orders = []

        # a) take strongest bid/asks
        if sell_orders:
            best_ask_price, best_ask_volume = sell_orders[0]
            if best_ask_price < true_value:
                buy_qty = min(10 - position, -best_ask_volume)
                if buy_qty > 0:
                    orders.append(Order(product, best_ask_price, buy_qty))
                    position += buy_qty

        if buy_orders:
            best_bid_price, best_bid_volume = buy_orders[0]
            if best_bid_price > true_value:
                sell_qty = min(10 + position, best_bid_volume)
                if sell_qty > 0:
                    orders.append(Order(product, best_bid_price, -sell_qty))
                    position -= sell_qty

        return orders
    
    def run(self, state: TradingState):
        """Only method required. It takes all buy and sell orders for all
        symbols as an input, and outputs a list of orders to be sent."""

        # Orders to be placed on exchange matching engine
        result = {}
        
        # 1. Emeralds
        """
        Strategy involves taking the strongest bid/asks and making the best quotes while maintaining positive edge.
        """
        product = "EMERALDS"
        true_value = 10000
        orders = self.simple_mid_price_strategy(product=product, state=state, true_value=true_value)
        result[product] = orders

        # 2. Tomatoes
        product = "TOMATOES"
        wall_mid, _, _ = self.get_wall_mid(product=product, state=state)
        orders = self.simple_mid_price_strategy(product=product, state=state, true_value=wall_mid)
        result[product] = orders

        # 3. Return
        conversions = 0
        traderData = ""

        return result, conversions, traderData