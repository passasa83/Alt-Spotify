from fastapi import APIRouter, Depends

from app.api.v1 import (
    admin,
    admin_invites,
    albums,
    artists,
    auth,
    devices,
    favorites,
    import_export,
    jam,
    lyrics,
    monitoring,
    music_scanner,
    notifications,
    playlists,
    podcasts,
    push,
    recommendations,
    search,
    social,
    stream,
    tidal,
    tracks,
    upload,
    users,
)
from app.utils.deps import get_current_user, get_current_user_stream

api_router = APIRouter()

# Private platform: catalogue reads need an account too. Routers with public
# endpoints (auth, share QR codes, metrics...) declare their auth per endpoint.
_logged_in = [Depends(get_current_user)]
# Tidal stream URLs may be used as <audio> sources, hence ?token= support.
_logged_in_media = [Depends(get_current_user_stream)]
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(artists.router, dependencies=_logged_in)
api_router.include_router(albums.router, dependencies=_logged_in)
api_router.include_router(tracks.router)
api_router.include_router(playlists.router)
api_router.include_router(search.router)
api_router.include_router(upload.router)
api_router.include_router(stream.router)
api_router.include_router(lyrics.router, dependencies=_logged_in)
api_router.include_router(jam.router)
api_router.include_router(social.router)
api_router.include_router(notifications.router)
api_router.include_router(podcasts.router)
api_router.include_router(monitoring.router)
api_router.include_router(import_export.router)
api_router.include_router(push.router)
api_router.include_router(admin.router)
api_router.include_router(recommendations.router, dependencies=_logged_in)
api_router.include_router(favorites.router)
api_router.include_router(admin_invites.router)
api_router.include_router(devices.router)
api_router.include_router(music_scanner.router)
api_router.include_router(tidal.router, dependencies=_logged_in_media)
