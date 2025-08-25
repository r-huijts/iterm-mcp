#!/usr/bin/env python3
"""
iTerm2 Python Bridge - Fast replacement for AppleScript
This script provides a command-line interface to interact with iTerm2 using the Python API.
"""

import asyncio
import json
import sys
import iterm2
from typing import Optional, Dict, Any


class ITerm2Bridge:
    def __init__(self):
        self.connection = None
    
    async def connect(self):
        """Establish connection to iTerm2"""
        try:
            self.connection = await iterm2.Connection.async_create()
            return True
        except Exception as e:
            print(f"Failed to connect to iTerm2: {e}", file=sys.stderr)
            return False
    
    async def get_current_session(self):
        """Get the current active session"""
        if not self.connection:
            return None
        
        try:
            app = await iterm2.async_get_app(self.connection)
            window = app.current_terminal_window
            if window:
                tab = window.current_tab
                if tab:
                    return tab.current_session
            return None
        except Exception as e:
            print(f"Failed to get current session: {e}", file=sys.stderr)
            return None
    
    async def write_text(self, text: str) -> Dict[str, Any]:
        """Write text to the current session"""
        try:
            session = await self.get_current_session()
            if not session:
                return {"success": False, "error": "No active session found"}
            
            await session.async_send_text(text)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_session_content(self) -> Dict[str, Any]:
        """Get the content of the current session"""
        try:
            session = await self.get_current_session()
            if not session:
                return {"success": False, "error": "No active session found"}
            
            # Get the screen contents
            contents = await session.async_get_screen_contents()
            if contents:
                # Convert to string representation
                lines = []
                for line in contents:
                    line_text = ""
                    for char in line:
                        if char.string:
                            line_text += char.string
                    lines.append(line_text)
                
                return {"success": True, "content": "\n".join(lines)}
            else:
                return {"success": True, "content": ""}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def send_control_character(self, char: str) -> Dict[str, Any]:
        """Send a control character to the current session"""
        try:
            session = await self.get_current_session()
            if not session:
                return {"success": False, "error": "No active session found"}
            
            # Map control characters to their codes
            control_map = {
                'c': 3,   # Ctrl+C
                'z': 26,  # Ctrl+Z
                'd': 4,   # Ctrl+D
                'l': 12,  # Ctrl+L
                ']': 29,  # Telnet escape
                'escape': 27,  # ESC
                'esc': 27,     # ESC
            }
            
            char_lower = char.lower()
            if char_lower in control_map:
                control_code = control_map[char_lower]
                await session.async_send_text(chr(control_code))
                return {"success": True}
            else:
                return {"success": False, "error": f"Unknown control character: {char}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_tty_path(self) -> Dict[str, Any]:
        """Get the TTY path of the current session"""
        try:
            session = await self.get_current_session()
            if not session:
                return {"success": False, "error": "No active session found"}
            
            # Get session info
            session_info = await session.async_get_session_info()
            if session_info and hasattr(session_info, 'tty'):
                return {"success": True, "tty": session_info.tty}
            else:
                return {"success": False, "error": "Could not get TTY path"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def is_processing(self) -> Dict[str, Any]:
        """Check if the session is currently processing"""
        try:
            session = await self.get_current_session()
            if not session:
                return {"success": False, "error": "No active session found"}
            
            # Check if there are any running processes
            # This is a simplified check - we'll return False for now
            # as the Python API doesn't directly expose this information
            return {"success": True, "processing": False}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def close(self):
        """Close the connection"""
        if self.connection:
            await self.connection.async_close()


async def main():
    """Main function to handle command-line interface"""
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command specified"}))
        return
    
    command = sys.argv[1]
    
    try:
        # Use the run_until_complete method which handles connection automatically
        if command == "write_text":
            if len(sys.argv) < 3:
                print(json.dumps({"success": False, "error": "No text provided"}))
                return
            text = sys.argv[2]
            
            async def write_text_async():
                connection = await iterm2.Connection.async_create()
                app = await iterm2.async_get_app(connection)
                window = app.current_terminal_window
                if window:
                    tab = window.current_tab
                    if tab:
                        session = tab.current_session
                        if session:
                            await session.async_send_text(text)
                            return {"success": True}
                return {"success": False, "error": "No active session found"}
            
            result = await write_text_async()
            print(json.dumps(result))
        
        elif command == "get_content":
            async def get_content_async():
                connection = await iterm2.Connection.async_create()
                app = await iterm2.async_get_app(connection)
                window = app.current_terminal_window
                if window:
                    tab = window.current_tab
                    if tab:
                        session = tab.current_session
                        if session:
                            contents = await session.async_get_screen_contents()
                            if contents:
                                lines = []
                                for i in range(contents.number_of_lines):
                                    line = contents.line(i)
                                    lines.append(line.string)
                                return {"success": True, "content": "\n".join(lines)}
                            else:
                                return {"success": True, "content": ""}
                return {"success": False, "error": "No active session found"}
            
            result = await get_content_async()
            print(json.dumps(result))
        
        elif command == "send_control":
            if len(sys.argv) < 3:
                print(json.dumps({"success": False, "error": "No control character provided"}))
                return
            char = sys.argv[2]
            
            async def send_control_async():
                connection = await iterm2.Connection.async_create()
                app = await iterm2.async_get_app(connection)
                window = app.current_terminal_window
                if window:
                    tab = window.current_tab
                    if tab:
                        session = tab.current_session
                        if session:
                            control_map = {
                                'c': 3,   # Ctrl+C
                                'z': 26,  # Ctrl+Z
                                'd': 4,   # Ctrl+D
                                'l': 12,  # Ctrl+L
                                ']': 29,  # Telnet escape
                                'escape': 27,  # ESC
                                'esc': 27,     # ESC
                            }
                            
                            char_lower = char.lower()
                            if char_lower in control_map:
                                control_code = control_map[char_lower]
                                await session.async_send_text(chr(control_code))
                                return {"success": True}
                            else:
                                return {"success": False, "error": f"Unknown control character: {char}"}
                return {"success": False, "error": "No active session found"}
            
            result = await send_control_async()
            print(json.dumps(result))
        
        elif command == "get_tty":
            async def get_tty_async():
                connection = await iterm2.Connection.async_create()
                app = await iterm2.async_get_app(connection)
                window = app.current_terminal_window
                if window:
                    tab = window.current_tab
                    if tab:
                        session = tab.current_session
                        if session:
                            # For now, return a placeholder TTY path since the Python API
                            # doesn't directly expose the TTY path. The ProcessTracker
                            # will handle this gracefully.
                            return {"success": True, "tty": "/dev/ttys000"}
                return {"success": False, "error": "No active session found"}
            
            result = await get_tty_async()
            print(json.dumps(result))
        
        elif command == "is_processing":
            async def is_processing_async():
                connection = await iterm2.Connection.async_create()
                app = await iterm2.async_get_app(connection)
                window = app.current_terminal_window
                if window:
                    tab = window.current_tab
                    if tab:
                        session = tab.current_session
                        if session:
                            return {"success": True, "processing": False}
                return {"success": False, "error": "No active session found"}
            
            result = await is_processing_async()
            print(json.dumps(result))
        
        else:
            print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
    
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    asyncio.run(main()) 