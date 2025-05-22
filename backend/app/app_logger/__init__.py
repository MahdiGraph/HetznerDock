# This is a compatibility module to avoid conflicts with Python's built-in logging
import logging as python_logging

# Re-export standard logging functions
getLogger = python_logging.getLogger
basicConfig = python_logging.basicConfig
DEBUG = python_logging.DEBUG
INFO = python_logging.INFO
WARNING = python_logging.WARNING
ERROR = python_logging.ERROR
CRITICAL = python_logging.CRITICAL

# Import local logger functions
from .logger import log_action

__all__ = [
    'getLogger', 'basicConfig', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL',
    'log_action'
]
