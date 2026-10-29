import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RenameItemModal from "./RenameItemModal";
test("a pending rename prevents duplicate requests and premature close", async () => {
 let finish; const onRename=jest.fn(()=>new Promise(resolve=>{finish=resolve;})), onClose=jest.fn();
 render(<RenameItemModal show currentName="old" onRename={onRename} onClose={onClose} />);
 fireEvent.change(screen.getByPlaceholderText("New name"),{target:{value:"new"}});
 fireEvent.click(screen.getByRole("button",{name:"Rename"}));
 expect(screen.getByRole("button",{name:"Rename"})).toBeDisabled();
 expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Rename"})); expect(onRename).toHaveBeenCalledTimes(1); expect(onClose).not.toHaveBeenCalled();
 await act(async()=>finish()); expect(onClose).toHaveBeenCalledTimes(1);
});
test("rename errors keep the entered name and allow a retry",async()=>{
 const onRename=jest.fn().mockRejectedValue(Error("Rename failed.")),onClose=jest.fn();
 render(<RenameItemModal show currentName="old" onRename={onRename} onClose={onClose} />);
 fireEvent.change(screen.getByPlaceholderText("New name"),{target:{value:"new"}});
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Rename"})));
 expect(screen.getByRole("alert")).toHaveTextContent("Rename failed.");expect(screen.getByPlaceholderText("New name")).toHaveValue("new");expect(onClose).not.toHaveBeenCalled();
});
