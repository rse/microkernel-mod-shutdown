/*
**  Microkernel -- Microkernel for Server Applications
**  Copyright (c) 2015-2021 Dr. Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*  the Microkernel module  */
class Module {
    get module () {
        return {
            name:  "microkernel-mod-shutdown",
            tag:   "SHUTDOWN",
            group: "BOOT",
            after: [ "CTX", "LOGGER" ]
        }
    }
    boot (kernel) {
        /*  perform application shutdown  */
        const shutdown = (reason, cb) => {
            kernel.state("dead").then(() => {
                /*  perform final callback  */
                kernel.sv("log", "shutdown", "info", `shutdown process (reason: ${reason})`)
                kernel.sv("log", "shutdown", "info", "#### TERMINATING PROCESS ####")
                cb(reason)
            }, (err) => {
                kernel.sv("log", "shutdown", "error", `shutdown process FAILED: ${err} (${err.stack})`)
            })
        }

        /*  handle fatal application error  */
        kernel.register("fatal", (error) => {
            kernel.sv("log", "shutdown", "error", `FATAL ERROR: ${error}`)
            shutdown("FATAL", () => process.exit(1))
        })

        /*  standard termination  */
        kernel.register("shutdown", (info) => {
            kernel.sv("log", "shutdown", "info", `terminating process: ${info}`)
            shutdown("SHUTDOWN", () => process.exit(0))
        })

        /*  handle signals  */
        const signals = [ "SIGUSR2", "SIGINT", "SIGTERM" ]
        const seen = {}
        signals.forEach((signal) => {
            const handler = () => {
                /*  react only once
                    NOTICE: we cannot use process.once(), because we regularily
                    (for unknown reasons) become the same signal delivered twice during
                    the shutdown processing, so let us ignore it here explicitly. */
                if (seen[signal])
                    return
                seen[signal] = true

                /*  terminate the process by removing the signal handler (ourself)
                    and re-delivering exactly the same signal once again (which is
                    important at least for nodemon, as it expects we get terminated by
                    exactly the signal SIGUSR2 he sent us)  */
                const terminate = (sig, hand) => {
                    process.removeListener(sig, hand)
                    process.kill(process.pid, sig)
                }
                if (kernel.rs("ctx:procmode") === "worker") {
                    /*  deferred delivery (to give master a chance to react first)  */
                    setTimeout(() => {
                        kernel.sv("log", "shutdown", "info", `#### received ${signal} signal (DEFERRED) ####`)
                        shutdown(signal, () => terminate(signal, handler))
                    }, 4 * 1000)
                }
                else {
                    /*  immediate delivery  */
                    kernel.sv("log", "shutdown", "info", `#### received ${signal} signal ####`)
                    shutdown(signal, () => terminate(signal, handler))
                }
            }
            process.on(signal, handler)
        })

        /*  handle exceptions  */
        process.on("uncaughtException", (error) => {
            kernel.sv("log", "shutdown", "error", `#### received uncaught exception: ${error.message} ####\n${error.stack}`)
            shutdown("EXCEPTION", () => process.exit(1))
        })
    }
}

/*  export the Microkernel module  */
module.exports = Module

