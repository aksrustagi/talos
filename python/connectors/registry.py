"""
Talos AI — Connector Registry and Factory

Central registry of all procurement platform connectors.  Use
``get_connector()`` to instantiate a connector by platform name.
"""

from connectors.base import ProcurementConnector, ConnectorConfig
from connectors.jaggaer import JaggaerConnector
from connectors.sap_ariba import SAPAribaConnector
from connectors.coupa import CoupaConnector
from connectors.oracle_fusion import OracleFusionConnector
from connectors.workday import WorkdayConnector
from connectors.gep_smart import GEPSmartConnector
from connectors.ivalua import IvaluaConnector
from connectors.basware import BaswareConnector
from connectors.zycus import ZycusConnector
from connectors.peoplesoft import PeopleSoftConnector
from connectors.epic import EpicConnector

CONNECTOR_REGISTRY = {
    "jaggaer": JaggaerConnector,
    "sap_ariba": SAPAribaConnector,
    "coupa": CoupaConnector,
    "oracle_fusion": OracleFusionConnector,
    "workday": WorkdayConnector,
    "gep_smart": GEPSmartConnector,
    "ivalua": IvaluaConnector,
    "basware": BaswareConnector,
    "zycus": ZycusConnector,
    "peoplesoft": PeopleSoftConnector,
    "epic": EpicConnector,
}


def get_connector(platform: str, config: ConnectorConfig) -> ProcurementConnector:
    """Instantiate a connector by platform name.

    Args:
        platform: One of the keys in ``CONNECTOR_REGISTRY``
                  (case-insensitive).
        config: Connector configuration (base_url, credentials, etc.).

    Returns:
        An instance of the requested connector.

    Raises:
        ValueError: If the platform name is not recognised.
    """
    cls = CONNECTOR_REGISTRY.get(platform.lower())
    if not cls:
        raise ValueError(
            f"Unknown platform: {platform}. "
            f"Supported: {list(CONNECTOR_REGISTRY.keys())}"
        )
    return cls(config)
