from round_0 import Trader
from datamodel import OrderDepth, UserId, TradingState, Order
from example_tradingstate import state

a, _, _ = Trader().run(state)
print(a)